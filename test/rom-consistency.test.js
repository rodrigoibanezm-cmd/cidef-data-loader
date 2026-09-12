import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DOMAIN_CAPABILITY_REGISTRY } from '../lib/custom-gpt-router.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expectedRom = [
  'business-rules.md',
  'business-semantics-tests.md',
  'business-semantics.md',
  'catalog.md',
  'decide.md',
  'instructions.md',
  'intake.md',
  'internal-schema.json',
  'orchestrator.md',
  'presentation.md',
  'render.md',
  'report.md',
  'schema.json',
  'synthesis.md',
];

function publicSchema() { return JSON.parse(readFileSync(join(root, 'rom/schema.json'), 'utf8')); }
function internalSchema() { return JSON.parse(readFileSync(join(root, 'rom/internal-schema.json'), 'utf8')); }

const requestSchemaByDomain = Object.freeze({
  SALES: 'SalesRequest', MARKET: 'MarketRequest', CRM: 'CrmRequest',
  DISCOVERY: 'DiscoveryRequest', LONGITUDINAL: 'LongitudinalRequest',
});
function requestCapabilities(schemas, requestSchema) {
  const request = schemas[requestSchema];
  if (request.properties?.capability?.enum) return request.properties.capability.enum;
  return request.oneOf.flatMap(({ $ref }) => {
    const branch = schemas[$ref.split('/').at(-1)];
    return branch.properties.capability.enum;
  });
}

function assertAllRefsResolve(document) {
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value.$ref?.startsWith('#/components/schemas/')) {
      assert.ok(document.components.schemas[value.$ref.split('/').at(-1)], value.$ref);
    }
    Object.values(value).forEach(visit);
  };
  visit(document);
}

test('legacy capability registry remains certified against internal schema', () => {
  const value = internalSchema();
  for (const [domain, requestSchema] of Object.entries(requestSchemaByDomain)) {
    const documented = requestCapabilities(value.components.schemas, requestSchema);
    const registered = Object.keys(DOMAIN_CAPABILITY_REGISTRY[domain]);
    assert.deepEqual(new Set(documented), new Set(registered), domain);
    assert.equal(new Set(documented).size, documented.length, `${domain} contains duplicate capabilities`);
  }
});

test('legacy VIN growth, RVM scope and CRM contracts remain in internal schema', () => {
  const document = internalSchema();
  const schemas = document.components.schemas;
  assert.equal(document.info.version, '1.62.0');
  assert.ok(schemas.SalesRequest.properties.capability.enum.includes('VIN_GROWTH_DIAGNOSTIC'));
  assert.deepEqual(schemas.VinGrowthDiagnosticInput.required, ['brand_id', 'store_id', 'current_month']);
  assert.deepEqual(schemas.OrganizationScope.enum, ['CIDEF', 'INDUMOTORA', 'MACO_TATTERSALL', 'ALL']);
  assert.deepEqual(schemas.CrmRequest.properties.capability.enum, ['CONTEXT', 'LONGITUDINAL_CONTEXT']);
  assert.deepEqual(schemas.CrmContextInput.required, ['date_from', 'date_to']);
  assert.deepEqual(schemas.CrmContextInput.properties.commercial_universe.enum, ['OWN_STORES', 'COMPANY']);
  assert.equal(schemas.CrmContextInput.properties.commercial_universe.enum.includes('DEALERS'), false);
});

test('legacy competitive contracts remain explicit in internal schema', () => {
  const schemas = internalSchema().components.schemas;
  assert.ok(schemas.MarketRequest.properties.capability.enum.includes('SHARE_TRANSFER'));
  assert.deepEqual(schemas.CompetitiveShareTransferInput.properties.comparison_scope.enum, ['TOTAL_MARKET', 'CHINESE_MARKET', 'MODEL_COMPARABLE_SET']);
  assert.equal(schemas.CompetitiveShareTransferOutput.properties.interpretation.const, 'CANDIDATE_COMPETITIVE_COUNTERPART');
  assert.ok(schemas.MarketRequest.properties.capability.enum.includes('GROWTH_MATRIX'));
  assert.equal(schemas.CompetitiveGrowthMatrixOutput.properties.cidef_measure.const, 'VENTAS_COMPANY');
  assert.equal(schemas.CompetitiveGrowthMatrixOutput.properties.benchmark_measure.const, 'RVM_REGISTRATIONS');
});

test('public agent schema exposes only RESOLVE and ANALYZE', () => {
  const document = publicSchema();
  assert.deepEqual(Object.keys(document.paths).sort(), ['/api/analyze', '/api/resolve']);
  const serialized = JSON.stringify(document);
  for (const forbidden of [
    'capability', 'motor', 'target_model_ids', 'ventas_universe_v01', 'rvm_universe_v01',
    'crm_universe_v01', 'commercial_operation_universe_v01', '/api/custom-gpt/', 'dependency_graph',
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test('both public and internal OpenAPI references resolve', () => {
  assertAllRefsResolve(publicSchema());
  assertAllRefsResolve(internalSchema());
});

test('ROM structure is atomic and exact', () => assert.deepEqual(readdirSync(join(root, 'rom')).sort(), expectedRom));
