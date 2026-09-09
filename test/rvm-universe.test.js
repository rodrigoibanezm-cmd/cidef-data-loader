import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assembleRvmUniverse,
  buildRvmUniverseQuery,
  parseRvmUniverseInput,
} from '../lib/rvm-universe/buildRvmUniverse.js';
import { assembleRvmLongitudinal, parseRvmLongitudinalInput } from '../lib/longitudinal/rvm.js';
import { rvmOrganizationResolutionCtes } from '../lib/rvm/rvmOrganizationScopeSql.js';

const events = [
  { fecha: '2026-01-10', cantidad: 10, brand_name: 'DONGFENG', model_name: 'MAGE', scope_brand_id: 1, model_id: 11, identity_status: 'RESUELTO', organization_bucket: 'INCLUDED', organization_ids: [101], pais_vin: 'CHINA', origin: 'CHINA' },
  { fecha: '2026-01-11', cantidad: 5, brand_name: 'DONGFENG', model_name: 'T5', scope_brand_id: 1, model_id: 12, identity_status: 'RESUELTO', organization_bucket: 'EXCLUDED_OTHER_ORGANIZATION', organization_ids: [102], pais_vin: 'CHINA', origin: 'CHINA' },
  { fecha: '2026-02-10', cantidad: 20, brand_name: 'FOTON', model_name: 'MIDI', scope_brand_id: 2, model_id: 21, identity_status: 'RESUELTO', organization_bucket: 'INCLUDED', organization_ids: [101], pais_vin: 'CHINA', origin: 'CHINA' },
  { fecha: '2026-02-11', cantidad: 8, brand_name: null, model_name: null, scope_brand_id: null, model_id: null, identity_status: 'NO_RESUELTO', organization_bucket: 'UNRESOLVED', organization_ids: null, pais_vin: 'JAPON', origin: 'JAPON' },
  { fecha: '2026-02-12', cantidad: 2, brand_name: null, model_name: null, scope_brand_id: null, model_id: null, identity_status: 'AMBIGUO', organization_bucket: 'AMBIGUOUS', organization_ids: null, pais_vin: null, origin: null },
];

function universe(extra = {}) {
  return parseRvmUniverseInput({
    date_from: '2026-01-01', date_to: '2026-02-28', organization_scope: 'ALL', ...extra,
  });
}

function longitudinal(metric, extra = {}) {
  const entity = metric === 'MARKET_SIZE' ? undefined
    : metric === 'RANK' ? { model: 'MAGE' } : { brand: 'DONGFENG' };
  return parseRvmLongitudinalInput({
    metric, grain: metric === 'RANK' ? 'MODEL' : metric === 'MARKET_SIZE' ? 'TOTAL' : 'BRAND',
    date_from: '2026-01-01', date_to: '2026-02-28', time_grain: 'MONTH',
    organization_scope: metric === 'MARKET_SIZE' ? 'ALL' : 'CIDEF', entity, ...extra,
  });
}

function row(period, numerator, denominator, value) {
  return {
    period, row_type: 'TOTAL', bucket_key: null, numerator: String(numerator),
    denominator: String(denominator), value: value == null ? null : String(value),
    last_observed_date: '2026-02-12', effective_date_to: '2026-02-12',
    identity_resolved: '35', identity_unresolved: '8', identity_ambiguous: '2', identity_total: '45',
    organization_included: '30', organization_excluded: '5', organization_unresolved: '8',
    organization_ambiguous: '2', organization_total: '45',
  };
}

test('rvm_universe_v01 exposes certified product, organization, origin, coverage and lineage', () => {
  const result = assembleRvmUniverse(universe({ organization_scope: 'CIDEF' }), events);
  assert.equal(result.universe, 'rvm_universe_v01');
  assert.equal(result.version, '0.1');
  assert.equal(result.organization_scope, 'CIDEF');
  assert.deepEqual(result.coverage.product_identity, { resolved: 35, unresolved: 8, ambiguous: 2, total: 45 });
  assert.deepEqual(result.coverage.organization_resolution, { included: 30, excluded_other_organization: 5, unresolved: 8, ambiguous: 2, total: 45 });
  assert.deepEqual(result.coverage.origin, { available: 43, unavailable: 2, total: 45 });
  assert.equal(result.validation.valid, true);
  assert.equal(result.period.last_observed_date, '2026-02-12');
  assert.equal(result.lineage.organization_authority, 'rvm_raw.marca = DFM');
  assert.equal(result.lineage.historical_fallback_authority, 'NOT_APPLICABLE');
});

test('origin is pais_vin without reinterpretation and CHINA reconciles to the legacy subset', () => {
  const all = assembleRvmUniverse(universe(), events);
  const legacyChina = events.filter((event) => String(event.pais_vin).toUpperCase() === 'CHINA');
  const china = assembleRvmUniverse(universe({ universe_filters: { origin: 'CHINA' } }), legacyChina);
  const allVin = all.coverage.product_identity.total;
  const chinaVin = china.coverage.product_identity.total;
  assert.equal(chinaVin, legacyChina.reduce((sum, event) => sum + event.cantidad, 0));
  assert.ok(chinaVin <= allVin);
  const query = buildRvmUniverseQuery(universe({ universe_filters: { origin: 'CHINA' } }));
  assert.match(query.sql, /master_norm\(u\.pais_vin\)/);
  assert.ok(query.params.some((value) => Array.isArray(value) && value[0] === 'CHINA'));
  assert.doesNotMatch(query.sql, /is_chinese|chinese_market|origin_group/i);
});

test('Dongfeng multi-importer scopes compose the certified organization resolver', () => {
  for (const scope of ['CIDEF', 'INDUMOTORA', 'MACO_TATTERSALL', 'ALL']) {
    const parsed = universe({ organization_scope: scope, universe_filters: { brand: 'DONGFENG' } });
    const query = buildRvmUniverseQuery(parsed);
    const organizationParam = scope === 'ALL' ? null : '$3';
    assert.ok(query.sql.includes(rvmOrganizationResolutionCtes({
      organizationScope: scope,
      organizationParam,
    })));
    if (scope !== 'ALL') assert.equal(query.params[2], scope);
  }
});

test('segment, type, geography, fuel and non-multi-importer product filters stay independent', () => {
  const cases = [
    ['segment', 'SUV', /u\.descripcion_segmento/],
    ['type', 'CAMIONETA', /u\.descripcion_tipo/],
    ['region', 'METROPOLITANA', /u\.region/],
    ['comuna', 'NUNOA', /u\.comuna_adquisicion/],
    ['fuel', 'DIESEL', /u\.combustible/],
    ['brand', 'FOTON', /u\.brand_name/],
    ['model', 'MIDI', /u\.model_name/],
  ];
  for (const [dimension, value, column] of cases) {
    const query = buildRvmUniverseQuery(universe({ universe_filters: { [dimension]: value } }));
    assert.match(query.sql, column, dimension);
    assert.ok(query.params.some((parameter) => Array.isArray(parameter) && parameter[0] === value), dimension);
  }
});

test('migrated calculation preserves MARKET_SIZE, ENTITY_VIN, MARKET_SHARE and RANK contracts', () => {
  const cases = [
    ['MARKET_SIZE', [row('2026-01', 0, 15, 15), row('2026-02', 0, 30, 30)], [15, 30]],
    ['ENTITY_VIN', [row('2026-01', 10, 15, 10), row('2026-02', 0, 30, 0)], [10, 0]],
    ['MARKET_SHARE', [row('2026-01', 10, 15, 10 / 15), row('2026-02', 0, 30, 0)], [10 / 15, 0]],
    ['RANK', [row('2026-01', 10, 15, 1), row('2026-02', 0, 30, null)], [1, null]],
  ];
  for (const [metric, rows, expected] of cases) {
    const parsed = longitudinal(metric);
    const result = assembleRvmLongitudinal(parsed, rows);
    assert.deepEqual(result.series.map((point) => point.value), expected, metric);
    if (metric === 'MARKET_SHARE') {
      assert.deepEqual(result.series.map((point) => [point.numerator, point.denominator]), [[10, 15], [0, 30]]);
    }
  }
});

test('longitudinal consumes the built universe and contains no DB, SQL, RAW or MASTER reconstruction', async () => {
  const source = await readFile(new URL('../lib/longitudinal/rvm.js', import.meta.url), 'utf8');
  assert.match(source, /buildRvmUniverse/);
  assert.doesNotMatch(source, /customGptDb|buildRvmUniverseCtes/);
  assert.doesNotMatch(source, /rvmIdentityResolutionCte|rvmModelAliasCtes|rvmOrganizationResolutionCtes/);
  assert.doesNotMatch(source, /rvm_raw|producto_aliases_v01|product_organization_membership|rvm_organization_historical_rule|marcas_master_v01|modelos_master_v01/);
});
