import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePeriod, comparePeriods } from '../lib/rvm/periods.js';
import { parseMarketHistoryInput } from '../lib/rvm/marketHistoryInput.js';
import { buildMarketHistoryQuery } from '../lib/rvm/marketHistoryQuery.js';
import { assembleMarketHistory } from '../lib/rvm/buildMarketHistory.js';
import { rvmIdentityResolutionCte, rvmModelAliasCtes } from '../lib/rvm/rvmIdentitySql.js';

test('normalizes period semantics inclusively', () => {
  assert.deepEqual(normalizePeriod({ kind: 'MONTH', month: '2026-08' }), { period_kind: 'MONTH', label: '2026-08', date_from: '2026-08-01', date_to: '2026-08-31' });
  assert.deepEqual(normalizePeriod({ kind: 'YEAR', year: 2025 }), { period_kind: 'YEAR', label: '2025', date_from: '2025-01-01', date_to: '2025-12-31' });
  assert.deepEqual(normalizePeriod({ kind: 'YTD', year: 2026, through_date: '2026-08-31' }), { period_kind: 'YTD', label: '2026-YTD@2026-08-31', date_from: '2026-01-01', date_to: '2026-08-31' });
  assert.throws(() => normalizePeriod({ kind: 'YEAR', year: 2099 }), /INVALID_PERIOD/);
});

test('comparison metadata distinguishes YTD boundary and duration', () => {
  const a = normalizePeriod({ kind: 'YTD', year: 2025, through_date: '2025-08-31' });
  const b = normalizePeriod({ kind: 'YTD', year: 2026, through_date: '2026-08-31' });
  assert.deepEqual(comparePeriods(a, b), ['SAME_YTD_BOUNDARY', 'SAME_CALENDAR_WINDOW', 'SAME_DURATION']);
});

test('input requires one period mode and rejects unsupported dimensions', () => {
  const scope = parseMarketHistoryInput({ period_a: { kind: 'YEAR', year: 2024 }, period_b: { kind: 'YEAR', year: 2025 }, time_grain: 'YEAR', universe_definition: { segment: 'CAMIONETA', geography: { level: 'REGION', values: ['Metropolitana'] } }, breakdown: 'BRAND' });
  assert.equal(scope.universe.geography.column, 'region');
  assert.throws(() => parseMarketHistoryInput({ period: { kind: 'YEAR', year: 2025 }, breakdown: 'VERSION' }), /INVALID_UNIVERSE_DIMENSION/);
});

test('query uses SUM(cantidad), normalized filters and exhaustive breakdown', () => {
  const query = buildMarketHistoryQuery(parseMarketHistoryInput({ period: { kind: 'YEAR', year: 2025 }, time_grain: 'YEAR', universe_definition: { segment: 'CAMIONETA' }, breakdown: 'SEGMENT' }));
  assert.match(query.sql, /sum\(coalesce\(s\.cantidad,0\)\)/i);
  assert.match(query.sql, /master_norm\(r\.descripcion_segmento\) = master_norm/);
  assert.equal(query.needsIdentity, false);
});

test('identity breakdown reuses shared contextual RVM primitive', () => {
  const query = buildMarketHistoryQuery(parseMarketHistoryInput({ period: { kind: 'YEAR', year: 2025 }, universe_definition: {}, breakdown: 'MODEL' }));
  assert.equal(query.needsIdentity, true);
  assert.match(query.sql, /context_model_norm=r\.raw_version_norm/);
  assert.match(rvmModelAliasCtes(), /fuente='rvm_raw'/);
  assert.match(rvmIdentityResolutionCte(), /CONTEXTUAL/);
});

test('assembler reconciles identity residuals', () => {
  const scope = parseMarketHistoryInput({ period: { kind: 'YEAR', year: 2025 }, time_grain: 'YEAR', universe_definition: {}, breakdown: 'BRAND' });
  const result = assembleMarketHistory(scope, { series: [{ period_id: 'period', period_bucket: '2025-01-01', universe_units: '100' }], period_totals: [{ period_id: 'period', universe_units: '100' }], breakdown: [{ period_id: 'period', period_bucket: '2025-01-01', bucket_key: 'BRAND:1', bucket_label: 'A', identity_status: 'RESOLVED', units: '80' }, { period_id: 'period', period_bucket: '2025-01-01', bucket_key: 'AMBIGUO', bucket_label: 'AMBIGUOUS', identity_status: 'AMBIGUOUS', units: '5' }, { period_id: 'period', period_bucket: '2025-01-01', bucket_key: 'NO_RESUELTO', bucket_label: 'UNRESOLVED', identity_status: 'UNRESOLVED', units: '15' }], coverage: { total_rows: '100', total_units: '100', resolved_units: '80', ambiguous_units: '5', unresolved_units: '15', corrections_negative_units: '0', non_standard_quantity_rows: '0' } }, true, { universe_definition: {} });
  assert.equal(result.validation.reconciliation_status, 'OK');
  assert.equal(result.coverage.status, 'PARTIAL');
  assert.equal(result.breakdown.reduce((sum, row) => sum + row.units, 0), 100);
});

test('comparison exposes ZERO_BASE', () => {
  const scope = parseMarketHistoryInput({ period_a: { kind: 'YEAR', year: 2024 }, period_b: { kind: 'YEAR', year: 2025 }, time_grain: 'YEAR' });
  const result = assembleMarketHistory(scope, { series: [], period_totals: [{ period_id: 'period_a', universe_units: '0' }, { period_id: 'period_b', universe_units: '10' }], breakdown: [], coverage: {} }, false, {});
  assert.equal(result.comparison.delta_pct, null);
  assert.equal(result.comparison.reason, 'ZERO_BASE');
});
