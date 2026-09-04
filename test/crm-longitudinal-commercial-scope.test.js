import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCrmLongitudinal, buildCrmLongitudinalQuery, parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

const base = (extra = {}) => ({ commercial_universe: 'COMPANY', metric: 'LEADS_CREATED', grain: 'TOTAL', mode: 'EVENT', date_axis: 'CREATED_AT', date_from: '2026-01-01', date_to: '2026-01-31', time_grain: 'MONTH', filters: {}, ...extra });
const parsed = (extra = {}) => parseCrmLongitudinalInput(base(extra));

test('commercial_universe is mandatory and DEALERS is explicit unsupported', () => {
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), commercial_universe: undefined }), /MISSING_COMMERCIAL_UNIVERSE/);
  assert.throws(() => parsed({ commercial_universe: 'DEALERS' }), /UNSUPPORTED_COMMERCIAL_UNIVERSE/);
});

test('COMPANY preserves unresolved commercial identity while OWN_STORES restricts before filters', () => {
  const companySql = buildCrmLongitudinalQuery(parsed()).sql;
  assert.match(companySql, /domain_scoped AS MATERIALIZED \(SELECT e\.\* FROM enriched e WHERE TRUE\)/);
  assert.match(companySql, /commercial_identity_unresolved/);
  const ownSql = buildCrmLongitudinalQuery(parsed({ commercial_universe: 'OWN_STORES' })).sql;
  assert.match(ownSql, /domain_scoped AS MATERIALIZED \(SELECT e\.\* FROM enriched e WHERE store_match_count=1 AND tipo_canal='CIDEF'\)/);
  assert.match(ownSql, /filtered AS MATERIALIZED \(SELECT e\.\* FROM domain_scoped e WHERE TRUE\)/);
});

test('STORE and SELLER require OWN_STORES, including filters and breakdowns', () => {
  assert.doesNotThrow(() => parsed({ commercial_universe: 'OWN_STORES', grain: 'STORE' }));
  assert.doesNotThrow(() => parsed({ commercial_universe: 'OWN_STORES', grain: 'SELLER' }));
  assert.throws(() => parsed({ grain: 'STORE' }), /DOMAIN_MISMATCH/);
  assert.throws(() => parsed({ grain: 'SELLER' }), /DOMAIN_MISMATCH/);
  assert.throws(() => parsed({ filters: { store: 'Bellavista' } }), /DOMAIN_MISMATCH/);
  assert.throws(() => parsed({ filters: { seller: 'X' } }), /DOMAIN_MISMATCH/);
});

test('SELLER keeps VENDEDOR_CIDEF and BRAND keeps exact PRODUCT MASTER semantics inside OWN_STORES', () => {
  const sellerSql = buildCrmLongitudinalQuery(parsed({ commercial_universe: 'OWN_STORES', breakdown: 'SELLER' })).sql;
  assert.match(sellerSql, /eligible_vendedor_cidef/);
  assert.match(sellerSql, /event_date BETWEEN/);
  const brandSql = buildCrmLongitudinalQuery(parsed({ commercial_universe: 'OWN_STORES', breakdown: 'BRAND' })).sql;
  assert.match(brandSql, /producto_aliases_v01/);
  assert.match(brandSql, /count\(DISTINCT marca_id\)::int brand_match_count/);
  assert.doesNotMatch(brandSql, /"Marca"/);
});

test('commercial scope output and coverage remain explicit and auditable', () => {
  const scope = parsed({ commercial_universe: 'OWN_STORES' });
  const row = { period: '2026-01', row_type: 'TOTAL', numerator: '3', denominator: '3', value: '3', last_observed_date: '2026-01-31', identity_total: '3', crm_total_records: '10', included_in_domain: '3', excluded_other_universe: '4', commercial_identity_unresolved: '1', commercial_identity_ambiguous: '1', commercial_identity_not_applicable: '1' };
  const result = assembleCrmLongitudinal(scope, [row]);
  assert.deepEqual(result.commercial_scope, { universe: 'OWN_STORES', authority: 'Sucursal Asignada exact MASTER identity via sucursales_master.tipo_canal', valid: true, scope_id: 'crm_commercial_scope_v01' });
  assert.deepEqual(result.commercial_coverage, { totalCrmRecordsConsidered: 10, includedInDomain: 3, excludedOtherUniverse: 4, unresolved: 1, ambiguous: 1, notApplicable: 1 });
  assert.equal(result.commercial_coverage.includedInDomain + result.commercial_coverage.excludedOtherUniverse + result.commercial_coverage.unresolved + result.commercial_coverage.ambiguous + result.commercial_coverage.notApplicable, result.commercial_coverage.totalCrmRecordsConsidered);
});

test('EVENT COHORT and SAME_DAY semantics remain unchanged', () => {
  const eventSql = buildCrmLongitudinalQuery(parsed({ commercial_universe: 'OWN_STORES' })).sql;
  assert.match(eventSql, /Creado el/);
  const cohort = parsed({ commercial_universe: 'OWN_STORES', metric: 'SOLD', mode: 'COHORT', cohort_axis: 'CREATED_AT' });
  assert.match(buildCrmLongitudinalQuery(cohort).sql, /"Vendido"/);
  const sameDay = parsed({ commercial_universe: 'OWN_STORES', cutoff_mode: 'SAME_DAY', cutoff_date: '2026-01-15' });
  assert.match(buildCrmLongitudinalQuery(sameDay).sql, /comparison_day/);
});
