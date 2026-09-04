import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCrmLongitudinal, buildCrmLongitudinalQuery, parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

function parsed(extra = {}) {
  return parseCrmLongitudinalInput({ metric: 'LEADS_CREATED', grain: 'TOTAL', mode: 'EVENT', date_axis: 'CREATED_AT', date_from: '2026-01-01', date_to: '2026-02-28', time_grain: 'MONTH', ...extra });
}
const rows = [
  { period: '2026-01', row_type: 'TOTAL', bucket_key: null, numerator: '10', denominator: '10', value: '10', source_records: '25', valid_axis_records: '20', missing_or_invalid_axis_records: '5' },
  { period: '2026-02', row_type: 'TOTAL', bucket_key: null, numerator: '0', denominator: '0', value: '0', source_records: '25', valid_axis_records: '20', missing_or_invalid_axis_records: '5' },
];

test('LEADS_CREATED requires explicit CREATED_AT event axis', () => {
  assert.equal(assembleCrmLongitudinal(parsed(), rows).series[0].value, 10);
  assert.throws(() => parsed({ date_axis: 'ASSIGNED_AT' }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
});

test('SOLD cohort by creation date and conversion rate are deterministic', () => {
  const sold = parsed({ metric: 'SOLD', mode: 'COHORT', cohort_axis: 'CREATED_AT' });
  assert.match(buildCrmLongitudinalQuery(sold).sql, /"Vendido"/);
  const conversion = parsed({ metric: 'CONVERSION_RATE', mode: 'COHORT', cohort_axis: 'CREATED_AT' });
  const result = assembleCrmLongitudinal(conversion, [{ ...rows[0], numerator: '4', denominator: '10', value: '0.4' }, rows[1]]);
  assert.equal(result.series[0].numerator, 4);
  assert.equal(result.series[0].denominator, 10);
  assert.equal(result.series[0].value, 0.4);
});

test('UNMANAGED and OPPORTUNITY map only to explicit CRM Estado values', () => {
  assert.match(buildCrmLongitudinalQuery(parsed({ metric: 'UNMANAGED', mode: 'COHORT', cohort_axis: 'CREATED_AT' })).sql, /SIN GESTION/);
  assert.match(buildCrmLongitudinalQuery(parsed({ metric: 'OPPORTUNITY', mode: 'COHORT', cohort_axis: 'CREATED_AT' })).sql, /OPORTUNIDAD/);
});

test('origin and raw product filters are explicit', () => {
  const query = buildCrmLongitudinalQuery(parsed({ filters: { origin: 'WEB', product_interest: 'MAGE' } }));
  assert.match(query.sql, /"Origen"/);
  assert.match(query.sql, /"Producto de interes"/);
});

test('date axes map to actual RAW columns', () => {
  assert.match(buildCrmLongitudinalQuery(parsed({ metric: 'DESISTED', date_axis: 'DESISTED_AT' })).sql, /"Desistido el"/);
  const managed = parsed({ metric: 'SOLD', mode: 'COHORT', cohort_axis: 'MANAGED_AT' });
  assert.match(buildCrmLongitudinalQuery(managed).sql, /"Gestionado el"/);
});

test('breakdown and missing date coverage stay visible', () => {
  const scope = parsed({ breakdown: 'ORIGIN' });
  const result = assembleCrmLongitudinal(scope, [...rows, { ...rows[0], row_type: 'BREAKDOWN', bucket_key: 'WEB', bucket_label: 'Web', value: '7', numerator: '7', denominator: '7' }]);
  assert.equal(result.seriesByBreakdown[0].identityStatus, 'RAW');
  assert.equal(result.metadata.coverage.missingOrInvalidAxisRecords, 5);
});

test('historical snapshots and unsupported dimensions fail explicitly', () => {
  assert.throws(() => parsed({ mode: 'SNAPSHOT' }), /UNSUPPORTED_TEMPORAL_RECONSTRUCTION/);
  assert.throws(() => parsed({ filters: { canonical_store_id: 1 } }), /UNSUPPORTED_FILTER/);
});
