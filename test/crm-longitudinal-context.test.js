import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCrmLongitudinal, buildCrmLongitudinalQuery, parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

function parsed(extra = {}) {
  return parseCrmLongitudinalInput({ metric: 'LEADS_CREATED', grain: 'TOTAL', mode: 'EVENT', date_axis: 'CREATED_AT', date_from: '2026-01-01', date_to: '2026-02-28', time_grain: 'MONTH', ...extra });
}
const rows = [
  { period: '2026-01', row_type: 'TOTAL', bucket_key: null, numerator: '10', denominator: '10', value: '10', source_records: '25', valid_axis_records: '20', missing_or_invalid_axis_records: '5', invalid_managed_date_records: '1', last_observed_date: '2026-02-26', effective_date_to: '2026-02-26', store_resolved: '15', store_unresolved: '3', store_ambiguous: '1', store_not_applicable: '1', seller_resolved: '12', seller_unresolved: '3', seller_ambiguous: '1', seller_not_applicable: '4', identity_total: '20' },
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

test('UNMANAGED is the exact complement of valid management-date evidence', () => {
  assert.match(buildCrmLongitudinalQuery(parsed({ metric: 'UNMANAGED', mode: 'COHORT', cohort_axis: 'CREATED_AT' })).sql, /NOT \(managed_date IS NOT NULL\)/);
  assert.match(buildCrmLongitudinalQuery(parsed({ metric: 'OPPORTUNITY', mode: 'COHORT', cohort_axis: 'CREATED_AT' })).sql, /OPORTUNIDAD/);
  const result = assembleCrmLongitudinal(parsed({ metric: 'UNMANAGED', mode: 'COHORT', cohort_axis: 'CREATED_AT' }), rows);
  assert.equal(result.coverage.eventDateCoverage.invalidManagedDateRecords, 1);
  assert.ok(result.warnings.includes('CRM_INVALID_MANAGED_DATE_PRESENT'));
  assert.match(result.metadata.managementDefinitions.unmanaged, /missing or empty values and present but unparseable values/);
  assert.match(result.metadata.managementDefinitions.invalidManagedDate, /remain UNMANAGED/);
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
  assert.equal(result.coverage.eventDateCoverage.missingOrInvalidAxisRecords, 5);
  assert.equal(result.coverage.dimensionCoverage.find((row) => row.dimension === 'STORE').ambiguous, 1);
  assert.ok(result.warnings.includes('CRM_MISSING_OR_INVALID_EVENT_DATE_PRESENT'));
});

test('STORE and SELLER resolve through exact MASTER evidence and preserve RAW audit values', () => {
  const storeQuery = buildCrmLongitudinalQuery(parsed({ breakdown: 'STORE' })).sql;
  assert.match(storeQuery, /sucursal_aliases a WHERE a.validated/);
  assert.match(storeQuery, /store_match_count>1 THEN 'AMBIGUOUS'/);
  const sellerQuery = buildCrmLongitudinalQuery(parsed({ breakdown: 'SELLER' })).sql;
  assert.match(sellerQuery, /persona_aliases a WHERE a.validated/);
  assert.match(sellerQuery, /eligible_vendedor_cidef/);
  assert.match(sellerQuery, /array_agg\(DISTINCT/);
  const result = assembleCrmLongitudinal(parsed({ breakdown: 'STORE' }), [...rows, { ...rows[0], row_type: 'BREAKDOWN', bucket_key: '7', bucket_label: 'BELLAVISTA', identity_status: 'RESOLVED', raw_values: ['Bellavista'], value: '7', numerator: '7', denominator: '7' }]);
  assert.deepEqual(result.seriesByBreakdown[0].rawValues, ['Bellavista']);
  assert.equal(result.seriesByBreakdown[0].identityStatus, 'RESOLVED');
});

test('SELLER membership uses the selected temporal axis event date', () => {
  for (const axis of ['CREATED_AT', 'ASSIGNED_AT', 'MANAGED_AT', 'DESISTED_AT']) {
    const scope = parsed({ metric: 'SOLD', mode: 'COHORT', cohort_axis: axis, breakdown: 'SELLER' });
    const query = buildCrmLongitudinalQuery(scope).sql;
    assert.match(query, /event_date BETWEEN/);
    assert.match(query, new RegExp({ CREATED_AT: 'Creado el', ASSIGNED_AT: 'Asignado el', MANAGED_AT: 'Gestionado el', DESISTED_AT: 'Desistido el' }[axis]));
  }
});

test('management ratios expose reconciled numerator and denominator', () => {
  for (const metric of ['MANAGED', 'UNMANAGED', 'MANAGEMENT_COVERAGE', 'CONVERSION_ON_MANAGED']) {
    const scope = parsed({ metric, mode: 'COHORT', cohort_axis: 'CREATED_AT' });
    const query = buildCrmLongitudinalQuery(scope).sql;
    assert.match(query, /managed_date/);
  }
  const coverage = assembleCrmLongitudinal(parsed({ metric: 'MANAGEMENT_COVERAGE', mode: 'COHORT', cohort_axis: 'CREATED_AT' }), [{ ...rows[0], numerator: '8', denominator: '10', value: '0.8' }]);
  assert.equal(coverage.series[0].numerator, 8);
  assert.equal(coverage.series[0].denominator, 10);
  assert.equal(coverage.metadata.managementDefinitions.managed, 'Gestionado el parses to a valid date');
  assert.equal(coverage.metadata.managementDefinitions.managementCoverage, 'MANAGED / (MANAGED + UNMANAGED)');
  const conversion = assembleCrmLongitudinal(parsed({ metric: 'CONVERSION_ON_MANAGED', mode: 'COHORT', cohort_axis: 'CREATED_AT' }), [{ ...rows[0], numerator: '3', denominator: '8', value: '0.375' }]);
  assert.equal(conversion.series[0].value, 0.375);
});

test('historical snapshots and unsupported dimensions fail explicitly', () => {
  assert.throws(() => parsed({ mode: 'SNAPSHOT' }), /UNSUPPORTED_TEMPORAL_RECONSTRUCTION/);
  assert.throws(() => parsed({ filters: { canonical_store_id: 1 } }), /UNSUPPORTED_FILTER/);
});
