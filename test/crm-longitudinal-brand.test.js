import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCrmLongitudinal, buildCrmLongitudinalQuery, parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

const parsed = (extra = {}) => parseCrmLongitudinalInput({
  metric: 'LEADS_CREATED', grain: 'TOTAL', mode: 'EVENT', date_axis: 'CREATED_AT',
  date_from: '2026-01-01', date_to: '2026-01-31', time_grain: 'MONTH', ...extra,
});

test('BRAND resolves from exact PRODUCT MASTER candidates built from Producto de interes', () => {
  const sql = buildCrmLongitudinalQuery(parsed({ breakdown: 'BRAND' })).sql;
  assert.match(sql, /modelos_master_v01/);
  assert.match(sql, /versiones_master_v01/);
  assert.match(sql, /producto_aliases_v01/);
  assert.match(sql, /a\.estado='RESUELTO'/);
  assert.match(sql, /concat_ws\(' ',ma\.nombre_canonico,m\.nombre_canonico\)/);
  assert.match(sql, /LEFT JOIN product_map pr ON pr\.norm=d\.product_interest_norm/);
  assert.doesNotMatch(sql, /"Marca"/);
});

test('FOTON and DONGFENG resolved BRAND buckets remain canonical', () => {
  const scope = parsed({ breakdown: 'BRAND' });
  const base = { period: '2026-01', row_type: 'TOTAL', bucket_key: null, numerator: '2', denominator: '2', value: '2', last_observed_date: '2026-01-31', identity_total: '2', brand_resolved: '2', brand_unresolved: '0', brand_ambiguous: '0', brand_not_applicable: '0' };
  const result = assembleCrmLongitudinal(scope, [
    base,
    { ...base, row_type: 'BREAKDOWN', bucket_key: 'FOTON', bucket_label: 'FOTON', identity_status: 'RESOLVED', raw_values: ['Foton Foton G7'], numerator: '1', denominator: '1', value: '1' },
    { ...base, row_type: 'BREAKDOWN', bucket_key: 'DONGFENG', bucket_label: 'DONGFENG', identity_status: 'RESOLVED', raw_values: ['Dongfeng Aeolus Y3'], numerator: '1', denominator: '1', value: '1' },
  ]);
  assert.deepEqual(result.seriesByBreakdown.map((item) => [item.key, item.identityStatus]), [['FOTON', 'RESOLVED'], ['DONGFENG', 'RESOLVED']]);
});

test('non-unique or missing product identity never invents BRAND and coverage reconciles', () => {
  const sql = buildCrmLongitudinalQuery(parsed({ breakdown: 'BRAND' })).sql;
  assert.match(sql, /count\(DISTINCT modelo_id\)::int match_count/);
  assert.match(sql, /brand_match_count>1 THEN 'AMBIGUOUS'/);
  assert.match(sql, /brand IS NULL THEN 'UNRESOLVED'/);
  const row = { period: '2026-01', row_type: 'TOTAL', numerator: '10', denominator: '10', value: '10', last_observed_date: '2026-01-31', identity_total: '10', brand_resolved: '6', brand_unresolved: '2', brand_ambiguous: '1', brand_not_applicable: '1' };
  const result = assembleCrmLongitudinal(parsed(), [row]);
  const coverage = result.coverage.dimensionCoverage.find((item) => item.dimension === 'BRAND');
  assert.equal(coverage.resolved + coverage.unresolved + coverage.ambiguous + coverage.notApplicable, coverage.total);
  assert.equal(coverage.total, 10);
});

test('BRAND filters use canonical enriched brand, not CRM raw Marca', () => {
  const query = buildCrmLongitudinalQuery(parsed({ filters: { brand: 'DONGFENG' } }));
  assert.match(query.sql, /master_norm\(e\.brand\)/);
  assert.doesNotMatch(query.sql, /"Marca"/);
});

test('other CRM dimensions retain raw or existing MASTER semantics', () => {
  const sql = buildCrmLongitudinalQuery(parsed({ filters: { origin: 'WEB', product_interest: 'MAGE' }, breakdown: 'SELLER' })).sql;
  assert.match(sql, /"Origen"/);
  assert.match(sql, /"Producto de interes"/);
  assert.match(sql, /persona_aliases a WHERE a\.validated/);
  assert.match(sql, /eligible_vendedor_cidef/);
});
