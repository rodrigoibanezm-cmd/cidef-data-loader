import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assembleRvmLongitudinal, buildRvmLongitudinal, calculateRvmLongitudinal,
  parseRvmLongitudinalInput,
} from '../lib/longitudinal/rvm.js';
import { organizationCoverageState } from '../lib/rvm/rvmOrganizationScopeSql.js';

const sourceEvents = [
  event('2025-01-05', 10, 1, 'DONGFENG', 11, 'MAGE', 'SUV', 'CHINA', ['CIDEF']),
  event('2025-01-20', 5, 1, 'DONGFENG', 12, 'T5', 'SUV', 'CHINA', ['INDUMOTORA']),
  event('2025-02-10', 20, 2, 'FOTON', 21, 'MIDI', 'COMERCIAL', 'CHINA', ['CIDEF']),
  event('2025-02-25', 30, 3, 'TOYOTA', 31, 'RAV4', 'SUV', 'JAPON', ['MACO_TATTERSALL']),
  event('2026-01-05', 12, 1, 'DONGFENG', 11, 'MAGE', 'SUV', 'CHINA', ['CIDEF']),
  event('2026-01-15', 30, 3, 'TOYOTA', 31, 'RAV4', 'SUV', 'JAPON', ['MACO_TATTERSALL']),
  event('2026-01-20', 8, 1, 'DONGFENG', 12, 'T5', 'SUV', 'CHINA', ['INDUMOTORA']),
  event('2026-02-10', 6, 1, 'DONGFENG', 13, 'RICH 6', 'CAMIONETA', 'CHINA', ['MACO_TATTERSALL']),
  event('2026-02-25', 24, 2, 'FOTON', 21, 'MIDI', 'COMERCIAL', 'CHINA', ['CIDEF']),
];

function event(fecha, cantidad, scopeBrandId, brandName, modelId, modelName, segment, origin, memberships) {
  return {
    fecha, cantidad, scope_brand_id: scopeBrandId, brand_name: brandName,
    model_id: modelId, model_name: modelName, identity_status: 'RESUELTO',
    descripcion_segmento: segment, descripcion_tipo: segment, region: 'METROPOLITANA',
    comuna_adquisicion: 'NUNOA', combustible: 'GASOLINA', pais_vin: origin,
    memberships,
  };
}

function matchesFilters(row, filters = {}) {
  const values = {
    brand_id: row.scope_brand_id, brand: row.brand_name, model_id: row.model_id,
    model: row.model_name, segment: row.descripcion_segmento, type: row.descripcion_tipo,
    region: row.region, comuna: row.comuna_adquisicion, fuel: row.combustible,
    origin: row.pais_vin,
  };
  return Object.entries(filters).every(([key, accepted]) => {
    const candidates = Array.isArray(accepted) ? accepted : [accepted];
    return candidates.some((candidate) => String(candidate).trim().toUpperCase()
      === String(values[key]).trim().toUpperCase());
  });
}

function preparedUniverse(scope = 'ALL', filters = {}, events = sourceEvents) {
  const analyticalEvents = events.filter((row) => matchesFilters(row, filters)).map((row) => ({
    ...row,
    organization_bucket: scope === 'ALL' ? 'INCLUDED'
      : row.memberships == null ? 'UNRESOLVED'
        : row.memberships.includes(scope) ? 'INCLUDED' : 'EXCLUDED_OTHER_ORGANIZATION',
  }));
  const dates = analyticalEvents.map((row) => row.fecha).sort();
  return {
    universe: 'rvm_universe_v01', version: '0.1', organization_scope: scope,
    market_universe_filters: filters, analytical_events: analyticalEvents,
    period: { last_observed_date: dates.at(-1) ?? null },
    coverage: {}, validation: { valid: true }, warnings: [],
  };
}

function parsed(metric, extra = {}) {
  const entity = metric === 'MARKET_SIZE' ? undefined
    : metric === 'RANK' ? { brand: 'DONGFENG' } : { brand: 'DONGFENG' };
  return parseRvmLongitudinalInput({
    metric, grain: metric === 'RANK' ? 'BRAND' : metric === 'MARKET_SIZE' ? 'TOTAL' : 'BRAND',
    date_from: '2026-01-01', date_to: '2026-03-31', time_grain: 'MONTH',
    organization_scope: metric === 'MARKET_SIZE' ? 'ALL' : 'CIDEF', entity, ...extra,
  });
}

test('pure MARKET_SIZE preserves dense MONTH series, empty periods and changes', () => {
  const result = calculateRvmLongitudinal(preparedUniverse(), parsed('MARKET_SIZE'));
  assert.deepEqual(result.series, [
    { period: '2026-01', value: 50, absoluteChange: null, pctChange: null },
    { period: '2026-02', value: 30, absoluteChange: -20, pctChange: -0.4 },
    { period: '2026-03', value: 0, absoluteChange: -30, pctChange: -1 },
  ]);
  assert.equal(result.temporalSemantics.effectiveDateTo, '2026-02-25');
  assert.equal(result.coverage.organizationCoverage.state, 'NOT_APPLICABLE');
});

test('pure ENTITY_VIN and MARKET_SHARE preserve entity numerator and market denominator', () => {
  const universe = preparedUniverse('CIDEF');
  const vin = calculateRvmLongitudinal(universe, parsed('ENTITY_VIN'));
  assert.deepEqual(vin.series.map((row) => row.value), [12, 0, 0]);
  const share = calculateRvmLongitudinal(universe, parsed('MARKET_SHARE'));
  assert.deepEqual(share.series.map((row) => [row.numerator, row.denominator, row.value]), [
    [12, 50, 0.24], [0, 30, 0], [0, 0, null],
  ]);
  assert.deepEqual(share.coverage.organizationCoverage, {
    scope: 'CIDEF', state: 'RESOLVED', included: 12, excludedOtherOrganization: 14,
    unresolved: 0, ambiguous: 0, total: 26,
  });
  assert.equal(share.metadata.denominatorExplicit, true);
  assert.deepEqual(share.metadata.entity, { brand: ['DONGFENG'] });
});

test('pure RANK preserves BRAND and MODEL candidate universes and deterministic order', () => {
  const brand = calculateRvmLongitudinal(preparedUniverse('CIDEF'), parsed('RANK'));
  assert.deepEqual(brand.series.map((row) => [row.entityVin, row.denominator, row.value]), [
    [12, 50, 1], [0, 30, null], [0, 0, null],
  ]);
  const modelScope = parsed('RANK', { grain: 'MODEL', entity: { model: 'MAGE' } });
  const model = calculateRvmLongitudinal(preparedUniverse('CIDEF'), modelScope);
  assert.deepEqual(model.series.map((row) => row.value), [1, null, null]);
});

test('pure YEAR aggregation preserves the same full-period event universe', () => {
  const scope = parseRvmLongitudinalInput({
    metric: 'MARKET_SIZE', grain: 'TOTAL', organization_scope: 'ALL',
    date_from: '2025-01-01', date_to: '2026-12-31', time_grain: 'YEAR',
  });
  const result = calculateRvmLongitudinal(preparedUniverse(), scope);
  assert.deepEqual(result.series.map((row) => row.value), [65, 80]);
  assert.deepEqual(result.series.map((row) => row.absoluteChange), [null, 15]);
});

test('SAME_DAY uses the cutoff position and retains last-observed metadata', () => {
  const scope = parsed('MARKET_SIZE', {
    date_to: '2026-02-28', cutoff_mode: 'SAME_DAY', cutoff_date: '2026-02-10',
  });
  const result = calculateRvmLongitudinal(preparedUniverse(), scope);
  assert.deepEqual(result.series.map((row) => row.value), [12, 6]);
  assert.equal(result.temporalSemantics.lastObservedDate, '2026-02-25');
  assert.equal(result.temporalSemantics.effectiveDateTo, '2026-02-10');
  assert.equal(result.temporalSemantics.comparisonDay, 10);
});

test('FULL_PERIOD preserves complete prior periods while applying the effective cutoff date', () => {
  const scope = parsed('MARKET_SIZE', {
    date_to: '2026-02-28', cutoff_mode: 'FULL_PERIOD', cutoff_date: '2026-02-10',
  });
  const result = calculateRvmLongitudinal(preparedUniverse(), scope);
  assert.deepEqual(result.series.map((row) => row.value), [50, 6]);
  assert.equal(result.temporalSemantics.effectiveDateTo, '2026-02-10');
  assert.equal(result.temporalSemantics.comparisonDay, undefined);
});

test('SEGMENT breakdown is dense per bucket and preserves labels and changes', () => {
  const scope = parsed('MARKET_SIZE', { breakdown: 'SEGMENT' });
  const result = calculateRvmLongitudinal(preparedUniverse(), scope);
  assert.deepEqual(result.seriesByBreakdown.map((bucket) => bucket.key), ['CAMIONETA', 'COMERCIAL', 'SUV']);
  const suv = result.seriesByBreakdown.find((bucket) => bucket.key === 'SUV');
  assert.equal(suv.label, 'SUV');
  assert.equal(suv.identityStatus, 'RESOLVED');
  assert.deepEqual(suv.series.map((row) => row.value), [50, 0, 0]);
  assert.deepEqual(suv.series.map((row) => row.absoluteChange), [null, -50, 0]);
});

test('origin and segment filters are consumed from their already prepared universes', () => {
  const originFilters = { origin: ['CHINA'] };
  const originScope = parsed('MARKET_SIZE', { universe_filters: originFilters });
  const origin = calculateRvmLongitudinal(preparedUniverse('ALL', originFilters), originScope);
  assert.deepEqual(origin.series.map((row) => row.value), [20, 30, 0]);
  assert.deepEqual(origin.metadata.universeFilters, originFilters);

  const segmentFilters = { segment: ['SUV'] };
  const segmentScope = parsed('MARKET_SIZE', { universe_filters: segmentFilters });
  const segment = calculateRvmLongitudinal(preparedUniverse('ALL', segmentFilters), segmentScope);
  assert.deepEqual(segment.series.map((row) => row.value), [50, 0, 0]);
  assert.deepEqual(segment.metadata.universeFilters, segmentFilters);
});

test('Dongfeng multi-importer scopes use only prepared organization_bucket', () => {
  const expected = {
    CIDEF: [12, 0, 0], INDUMOTORA: [8, 0, 0],
    MACO_TATTERSALL: [0, 6, 0], ALL: [20, 6, 0],
  };
  for (const [scope, values] of Object.entries(expected)) {
    const parsedScope = parseRvmLongitudinalInput({
      metric: 'ENTITY_VIN', grain: 'BRAND', entity: { brand: 'DONGFENG' },
      organization_scope: scope, date_from: '2026-01-01', date_to: '2026-03-31',
      time_grain: 'MONTH',
    });
    const result = calculateRvmLongitudinal(preparedUniverse(scope), parsedScope);
    assert.deepEqual(result.series.map((row) => row.value), values, scope);
  }
});

test('coverage and warnings preserve unresolved and ambiguous quantity semantics', () => {
  const extra = [
    ...sourceEvents,
    { ...event('2026-02-12', 2, null, null, null, null, 'SUV', 'CHINA', null), identity_status: 'NO_RESUELTO' },
    { ...event('2026-02-13', 1, null, null, null, null, 'SUV', null, null), identity_status: 'AMBIGUO' },
  ];
  const result = calculateRvmLongitudinal(preparedUniverse('CIDEF', {}, extra), parsed('MARKET_SHARE'));
  const identity = result.coverage.dimensionCoverage[0];
  assert.deepEqual([identity.resolved, identity.unresolved, identity.ambiguous, identity.total], [80, 2, 1, 83]);
  assert.ok(result.warnings.includes('PRODUCT_IDENTITY_UNRESOLVED_PRESENT'));
  assert.ok(result.warnings.includes('PRODUCT_IDENTITY_AMBIGUOUS_PRESENT'));
});

test('integration builds the certified universe once and calculates without DB access in longitudinal', async () => {
  let received = null;
  let calls = 0;
  const input = {
    metric: 'MARKET_SHARE', grain: 'BRAND', entity: { brand: 'DONGFENG' },
    organization_scope: 'CIDEF', universe_filters: { origin: 'CHINA' },
    date_from: '2026-01-01', date_to: '2026-03-31', time_grain: 'MONTH',
    cutoff_mode: 'FULL_PERIOD',
  };
  const result = await buildRvmLongitudinal(input, { buildUniverse: async (universeInput) => {
    calls += 1;
    received = universeInput;
    return preparedUniverse('CIDEF', { origin: ['CHINA'] });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(received, {
    date_from: '2026-01-01', date_to: '2026-03-31', cutoff_date: null,
    cutoff_mode: 'FULL_PERIOD', organization_scope: 'CIDEF',
    universe_filters: { origin: ['CHINA'] },
  });
  assert.deepEqual(result.series.map((row) => row.value), [0.6, 0, null]);
});

test('longitudinal delegates status isolation to the certified universe without accepting snapshot logic', async () => {
  let received;
  await buildRvmLongitudinal({
    metric: 'MARKET_SIZE', grain: 'TOTAL', organization_scope: 'ALL',
    date_from: '2026-01-01', date_to: '2026-01-31', time_grain: 'MONTH',
  }, { buildUniverse: async (input) => { received = input; return preparedUniverse(); } });
  assert.equal('data_status' in received, false);
  assert.equal('snapshot_date' in received, false);
});

test('longitudinal source has no database, SQL, RAW, MASTER or universe CTE execution', async () => {
  const source = await readFile(new URL('../lib/longitudinal/rvm.js', import.meta.url), 'utf8');
  assert.match(source, /buildRvmUniverse/);
  assert.doesNotMatch(source, /customGptDb|buildRvmUniverseCtes|rvm_raw|marcas_master|modelos_master|producto_aliases|product_organization_membership|rvmOrganizationResolutionCtes|rvmIdentityResolutionCte|rvmModelAliasCtes/);
  assert.doesNotMatch(source, /\.query\(|SELECT |WITH |JOIN /);
});

test('legacy row assembler and organization coverage state remain compatible', () => {
  const scope = parsed('MARKET_SIZE');
  const result = assembleRvmLongitudinal(scope, [{
    period: '2026-01', row_type: 'TOTAL', numerator: 0, denominator: 100, value: 100,
    last_observed_date: '2026-01-31', identity_resolved: 100, identity_unresolved: 0,
    identity_ambiguous: 0, identity_total: 100, organization_included: 100,
    organization_excluded: 0, organization_unresolved: 0, organization_ambiguous: 0,
    organization_total: 100,
  }]);
  assert.equal(result.series[0].value, 100);
  assert.equal(organizationCoverageState({ organizationScope: 'CIDEF', total: 100, unresolved: 100 }), 'NO_COVERAGE');
});

test('closed input validation remains unchanged', () => {
  assert.throws(() => parsed('MARKET_SIZE', { organization_scope: 'CIDEF' }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
  assert.throws(() => parsed('ENTITY_VIN', { organization_scope: 'UNKNOWN' }), /INVALID_ORGANIZATION_SCOPE/);
  assert.throws(() => parsed('MARKET_SIZE', { universe_filters: { automatic_competitors: true } }), /UNSUPPORTED_FILTER/);
});
