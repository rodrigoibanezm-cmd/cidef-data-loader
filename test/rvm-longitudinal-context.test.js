import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleRvmLongitudinal, buildRvmLongitudinalQuery, parseRvmLongitudinalInput } from '../lib/longitudinal/rvm.js';
import { organizationCoverageState } from '../lib/rvm/rvmOrganizationScopeSql.js';

function parsed(extra = {}) {
  return parseRvmLongitudinalInput({ metric: 'MARKET_SIZE', grain: 'TOTAL', date_from: '2026-01-01', date_to: '2026-02-28', time_grain: 'MONTH', ...extra });
}
const totals = [
  { period: '2026-01', row_type: 'TOTAL', bucket_key: null, numerator: '20', denominator: '100', value: '100', last_observed_date: '2026-02-26', effective_date_to: '2026-02-26', identity_resolved: '90', identity_unresolved: '7', identity_ambiguous: '3', identity_total: '100', organization_included: '100', organization_excluded: '0', organization_unresolved: '0', organization_ambiguous: '0', organization_total: '100' },
  { period: '2026-02', row_type: 'TOTAL', bucket_key: null, numerator: '0', denominator: '0', value: '0' },
];

test('MARKET_SIZE produces dense vehicle series and temporal change', () => {
  const result = assembleRvmLongitudinal(parsed(), totals);
  assert.deepEqual(result.series.map((row) => row.value), [100, 0]);
  assert.equal(result.series[1].absoluteChange, -100);
  assert.equal(result.coverage.organizationCoverage.state, 'NOT_APPLICABLE');
});

test('ENTITY_VIN requires organization_scope for product-scoped RVM queries', () => {
  assert.throws(() => parsed({ metric: 'ENTITY_VIN', grain: 'MODEL', entity: { brand: 'DONGFENG', model: 'MAGE' }, universe_filters: { segment: ['SUV'] } }), /ORGANIZATION_SCOPE_REQUIRED/);
  const scope = parsed({ metric: 'ENTITY_VIN', grain: 'MODEL', entity: { brand: 'DONGFENG', model: 'MAGE' }, universe_filters: { segment: ['SUV'] }, organization_scope: 'CIDEF' });
  const query = buildRvmLongitudinalQuery(scope);
  assert.match(query.sql, /organization_resolution/);
  assert.match(query.sql, /product_organization_membership/);
  assert.match(query.sql, /rvm_organization_historical_rule/);
  assert.ok(query.params.includes('CIDEF'));
  assert.ok(query.params.some((value) => Array.isArray(value) && value.includes('SUV')));
});

test('organization scope keeps market-share denominator unscoped and target numerator scoped', () => {
  const scope = parsed({ metric: 'MARKET_SHARE', grain: 'BRAND', entity: { brand: 'DONGFENG' }, organization_scope: 'CIDEF' });
  const query = buildRvmLongitudinalQuery(scope);
  assert.match(query.sql, /base AS MATERIALIZED/);
  assert.match(query.sql, /entity_base AS MATERIALIZED \(SELECT \* FROM target_base WHERE organization_bucket='INCLUDED'\)/);
  const rows = totals.map((row, index) => ({ ...row, value: index ? null : '0.2', organization_included: '20', organization_excluded: '80', organization_total: '100' }));
  const result = assembleRvmLongitudinal(scope, rows);
  assert.deepEqual(result.series[0], { period: '2026-01', numerator: 20, denominator: 100, value: 0.2, absoluteChange: null, pctChange: null });
  assert.equal(result.coverage.organizationCoverage.state, 'RESOLVED');
  assert.equal(result.coverage.organizationCoverage.included, 20);
  assert.equal(result.coverage.organizationCoverage.excludedOtherOrganization, 80);
});

test('RANK requires an identified entity at the requested grain and propagates scope', () => {
  assert.throws(() => parsed({ metric: 'RANK', grain: 'MODEL', entity: { brand: 'DONGFENG' }, organization_scope: 'CIDEF' }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
  const scope = parsed({ metric: 'RANK', grain: 'MODEL', entity: { model: 'MAGE' }, organization_scope: 'CIDEF' });
  const query = buildRvmLongitudinalQuery(scope);
  assert.match(query.sql, /rank_base AS MATERIALIZED \(SELECT \* FROM base WHERE organization_bucket='INCLUDED'\)/);
  const result = assembleRvmLongitudinal(scope, [{ ...totals[0], value: '3' }, { ...totals[1], value: null }]);
  assert.equal(result.series[0].value, 3);
  assert.equal(result.series[1].value, null);
});

test('brand and model breakdown remain explicit including unresolved', () => {
  for (const breakdown of ['BRAND', 'MODEL']) {
    const scope = parsed({ breakdown });
    const rows = [...totals, { ...totals[0], row_type: 'BREAKDOWN', bucket_key: '1', bucket_label: 'A', value: '80' }, { ...totals[0], row_type: 'BREAKDOWN', bucket_key: 'UNRESOLVED', bucket_label: 'UNRESOLVED', value: '20' }];
    const result = assembleRvmLongitudinal(scope, rows);
    assert.equal(result.seriesByBreakdown.length, 2);
    assert.equal(result.seriesByBreakdown.find((row) => row.key === 'UNRESOLVED').identityStatus, 'UNRESOLVED');
  }
});

test('joint product identity coverage remains separate from organization coverage', () => {
  const result = assembleRvmLongitudinal(parsed(), totals);
  assert.equal(result.coverage.dimensionCoverage.length, 1);
  const coverage = result.coverage.dimensionCoverage[0];
  assert.equal(coverage.dimension, 'PRODUCT_IDENTITY');
  assert.deepEqual([coverage.resolved, coverage.unresolved, coverage.ambiguous, coverage.total], [90, 7, 3, 100]);
  assert.equal(coverage.resolved + coverage.unresolved + coverage.ambiguous + coverage.notApplicable, coverage.total);
  assert.ok(result.warnings.includes('PRODUCT_IDENTITY_UNRESOLVED_PRESENT'));
  assert.ok(result.warnings.includes('PRODUCT_IDENTITY_AMBIGUOUS_PRESENT'));
  assert.match(result.metadata.identityCoverageSemantics, /historical organization rules/);
});

test('organization coverage distinguishes zero, partial, no coverage and ambiguity', () => {
  assert.equal(organizationCoverageState({ organizationScope: 'CIDEF', total: 100, unresolved: 0, ambiguous: 0 }), 'RESOLVED');
  assert.equal(organizationCoverageState({ organizationScope: 'CIDEF', total: 100, unresolved: 4, ambiguous: 0 }), 'PARTIAL');
  assert.equal(organizationCoverageState({ organizationScope: 'CIDEF', total: 100, unresolved: 100, ambiguous: 0 }), 'NO_COVERAGE');
  assert.equal(organizationCoverageState({ organizationScope: 'CIDEF', total: 100, unresolved: 0, ambiguous: 1 }), 'AMBIGUOUS');
  assert.equal(organizationCoverageState({ organizationScope: 'CIDEF', total: 0, unresolved: 0, ambiguous: 0 }), 'RESOLVED');
});

test('MARKET_SIZE rejects organization-specific scope', () => {
  assert.throws(() => parsed({ organization_scope: 'CIDEF' }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
});

test('SAME_DAY and cutoff are explicit without changing the competitive universe', () => {
  const scope = parsed({ cutoff_mode: 'SAME_DAY', cutoff_date: '2026-02-26', universe_filters: { segment: 'SUV' } });
  const query = buildRvmLongitudinalQuery(scope);
  assert.match(query.sql, /extract\(day from r.fecha\)/);
  assert.ok(query.params.some((value) => Array.isArray(value) && value.includes('SUV')));
  assert.ok(query.params.includes('2026-02-26'));
});

test('invalid metric, invalid organization scope and invalid universe filter are rejected', () => {
  assert.throws(() => parsed({ metric: 'WINNERS' }), /INVALID_METRIC/);
  assert.throws(() => parsed({ metric: 'ENTITY_VIN', grain: 'BRAND', entity: { brand: 'DONGFENG' }, organization_scope: 'UNKNOWN' }), /INVALID_ORGANIZATION_SCOPE/);
  assert.throws(() => parsed({ universe_filters: { automatic_competitors: true } }), /UNSUPPORTED_FILTER/);
});
