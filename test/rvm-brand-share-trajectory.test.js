import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildRvmBrandShareTrajectory,
  parseRvmBrandShareTrajectoryInput,
  resolveRvmBrandIdentity,
} from '../lib/rvm-brand-share-trajectory/buildRvmBrandShareTrajectory.js';

const input = Object.freeze({
  entity: { brand: 'FOTON' },
  date_from: '2026-06-01',
  date_to: '2026-08-31',
  time_grain: 'MONTH',
  organization_scope: 'ALL',
});

function longitudinal(scope = 'ALL') {
  return {
    series: [
      { period: '2026-06', numerator: 100, denominator: 1000, value: 0.1, absoluteChange: null, pctChange: null },
      { period: '2026-07', numerator: 120, denominator: 1000, value: 0.12, absoluteChange: 0.02, pctChange: 0.2 },
      { period: '2026-08', numerator: 150, denominator: 1000, value: 0.15, absoluteChange: 0.03, pctChange: 0.25 },
    ],
    temporalSemantics: { effectiveDateTo: '2026-08-31' },
    coverage: {
      dimensionCoverage: [{ dimension: 'PRODUCT_IDENTITY', resolved: 3000, unresolved: 0, ambiguous: 0, total: 3000 }],
      organizationCoverage: { scope, state: scope === 'ALL' ? 'NOT_APPLICABLE' : 'RESOLVED' },
    },
    warnings: [],
    metadata: {
      denominatorExplicit: true,
      organizationScopeSemantics: 'organization_scope filters numerator only',
    },
  };
}

test('FOTON brand request is accepted without target_model_ids', () => {
  const parsed = parseRvmBrandShareTrajectoryInput(input);
  assert.equal(parsed.brand, 'FOTON');
  assert.equal(parsed.brandId, null);
  assert.equal(parsed.organizationScope, 'ALL');
});

test('brand identity resolves only through exact canonical MASTER identity', async () => {
  let received;
  const resolved = await resolveRvmBrandIdentity(parseRvmBrandShareTrajectoryInput(input), async (sql, params) => {
    received = { sql, params };
    return [{ marca_id: 123, nombre_canonico: 'FOTON' }];
  });
  assert.deepEqual(resolved, {
    entityType: 'BRAND', brandId: 123, brandName: 'FOTON', identityStatus: 'RESOLVED',
  });
  assert.match(received.sql, /nombre_normalizado=master_norm\(\$2::text\)/);
  assert.doesNotMatch(received.sql, /LIKE|ILIKE|similarity/i);
  assert.deepEqual(received.params, [null, 'FOTON']);
});

test('invalid brand returns explicit UNRESOLVED and no partial trajectory', async () => {
  let longitudinalCalls = 0;
  const result = await buildRvmBrandShareTrajectory(input, {
    resolveIdentity: async () => ({ entityType: 'BRAND', brandId: null, brandName: 'NO_EXISTE', identityStatus: 'UNRESOLVED' }),
    buildLongitudinal: async () => { longitudinalCalls += 1; },
  });
  assert.equal(longitudinalCalls, 0);
  assert.equal(result.entity.identityStatus, 'UNRESOLVED');
  assert.deepEqual(result.monthly, []);
  assert.equal(result.coverage.monthsRequested, 3);
  assert.ok(result.warnings.includes('REQUESTED_BRAND_UNRESOLVED'));
});

test('ambiguous brand returns explicit AMBIGUOUS and never selects a candidate', async () => {
  const parsed = parseRvmBrandShareTrajectoryInput(input);
  const entity = await resolveRvmBrandIdentity(parsed, async () => [
    { marca_id: 1, nombre_canonico: 'FOTON A' },
    { marca_id: 2, nombre_canonico: 'FOTON B' },
  ]);
  assert.equal(entity.identityStatus, 'AMBIGUOUS');
  assert.equal(entity.brandId, null);
  assert.deepEqual(entity.candidateBrandIds, [1, 2]);
});

test('trajectory exposes numerator, certified denominator, coverage and overall change', async () => {
  let received;
  const result = await buildRvmBrandShareTrajectory(input, {
    resolveIdentity: async () => ({ entityType: 'BRAND', brandId: 123, brandName: 'FOTON', identityStatus: 'RESOLVED' }),
    buildLongitudinal: async (value) => { received = value; return longitudinal('ALL'); },
  });
  assert.deepEqual(received.entity, { brand_id: 123 });
  assert.equal('target_model_ids' in received, false);
  assert.deepEqual(result.monthly.map((row) => [row.entityVin, row.marketSize, row.marketShare]), [
    [100, 1000, 0.1], [120, 1000, 0.12], [150, 1000, 0.15],
  ]);
  assert.deepEqual(result.change, {
    fromPeriod: '2026-06', toPeriod: '2026-08',
    shareChangePp: 5, shareChangePct: 0.5,
  });
  assert.deepEqual(result.coverage, {
    monthsRequested: 3, monthsReturned: 3, monthsEvaluable: 3,
    dimensionCoverage: longitudinal().coverage.dimensionCoverage,
    organizationCoverage: longitudinal().coverage.organizationCoverage,
  });
  assert.equal(result.validation.marketShareReconciles, true);
  assert.equal(result.validation.ok, true);
});

test('ALL, CIDEF, INDUMOTORA and MACO_TATTERSALL are preserved explicitly', async () => {
  for (const organizationScope of ['ALL', 'CIDEF', 'INDUMOTORA', 'MACO_TATTERSALL']) {
    let received;
    const result = await buildRvmBrandShareTrajectory({ ...input, organization_scope: organizationScope }, {
      resolveIdentity: async () => ({ entityType: 'BRAND', brandId: 123, brandName: 'FOTON', identityStatus: 'RESOLVED' }),
      buildLongitudinal: async (value) => { received = value; return longitudinal(organizationScope); },
    });
    assert.equal(received.organization_scope, organizationScope);
    assert.equal(result.scope.organizationScope, organizationScope);
    assert.equal(result.coverage.organizationCoverage.scope, organizationScope);
  }
});

test('public SHARE_TRAJECTORY motor dispatches entity requests to the certified brand path', async () => {
  const source = await readFile(new URL('../lib/motors/competitive-share-trajectory-v01.js', import.meta.url), 'utf8');
  assert.match(source, /if \(input\?\.entity != null\)/);
  assert.match(source, /buildRvmBrandShareTrajectory/);
  assert.match(source, /rvm_longitudinal_context_v01 over rvm_universe_v01/);
});

test('legacy explicit target_model_ids contract remains present and brand route is public in schema', async () => {
  const schema = JSON.parse(await readFile(new URL('../rom/schema.json', import.meta.url), 'utf8'));
  const market = schema.components.schemas.MarketInput.properties;
  assert.ok(market.target_model_ids);
  assert.equal(market.entity.$ref, '#/components/schemas/RvmBrandEntity');
  assert.equal(market.organization_scope.$ref, '#/components/schemas/OrganizationScope');
});

test('brand route rejects mixed legacy/model inputs and implicit organization scope', () => {
  assert.throws(() => parseRvmBrandShareTrajectoryInput({ ...input, target_model_ids: [481] }), /UNSUPPORTED_SHARE_TRAJECTORY_FIELD/);
  const { organization_scope: ignored, ...withoutScope } = input;
  assert.throws(() => parseRvmBrandShareTrajectoryInput(withoutScope), /ORGANIZATION_SCOPE_REQUIRED/);
  assert.throws(() => parseRvmBrandShareTrajectoryInput({ ...input, entity: { brand: 'FOTON', brand_id: 1 } }), /INVALID_BRAND_ENTITY/);
});
