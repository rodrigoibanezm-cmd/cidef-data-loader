import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTemporalSemantics, dateWithinComparableCutoff, outputEnvelope, parseCutoff,
  withChanges,
} from '../lib/longitudinal/common.js';

test('FULL_PERIOD and SAME_DAY cutoff inputs validate deterministically', () => {
  assert.deepEqual(parseCutoff({}), { cutoffMode: 'FULL_PERIOD', cutoffDate: null });
  assert.deepEqual(parseCutoff({ cutoff_mode: 'SAME_DAY', cutoff_date: '2026-08-26' }), { cutoffMode: 'SAME_DAY', cutoffDate: '2026-08-26' });
  assert.throws(() => parseCutoff({ cutoff_date: '2026-02-30' }), /INVALID_CUTOFF_DATE/);
  assert.throws(() => parseCutoff({ cutoff_mode: 'LATEST' }), /INVALID_CUTOFF_MODE/);
});

test('database Date objects normalize to ISO temporal semantics', () => {
  const parsed = { dateFrom: '2026-01-01', dateTo: '2026-08-31', timeGrain: 'MONTH', cutoffMode: 'SAME_DAY', cutoffDate: null };
  const temporal = buildTemporalSemantics(parsed, new Date('2026-08-25T00:00:00.000Z'));
  assert.equal(temporal.lastObservedDate, '2026-08-25');
  assert.equal(temporal.effectiveDateTo, '2026-08-25');
  assert.equal(temporal.comparisonDay, 25);
});

test('common envelope exposes V0.2 temporal semantics, coverage and warnings', () => {
  const parsed = { metric: 'X', grain: 'TOTAL', timeGrain: 'MONTH', dateFrom: '2026-01-01', dateTo: '2026-01-31', filters: {}, breakdown: null };
  const temporalSemantics = buildTemporalSemantics({ ...parsed, cutoffMode: 'FULL_PERIOD', cutoffDate: null }, '2026-01-31');
  const series = withChanges([{ period: '2026-01', value: 2 }, { period: '2026-02', value: 3 }]);
  const result = outputEnvelope({ motor: 'x', domain: 'X', parsed, series, temporalSemantics, coverage: { dimensionCoverage: [] }, warnings: [] });
  assert.equal(result.version, '0.2');
  assert.equal(result.temporalSemantics.lastPeriodComplete, true);
  assert.deepEqual(result.coverage.dimensionCoverage, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.series[1].absoluteChange, 1);
  assert.equal(result.series[1].pctChange, 0.5);
});

test('SAME_DAY includes every real day in shorter months without imputing days', () => {
  const parsed = { dateFrom: '2026-01-01', dateTo: '2026-03-31', timeGrain: 'MONTH', cutoffMode: 'SAME_DAY', cutoffDate: '2026-03-31' };
  assert.equal(dateWithinComparableCutoff('2026-02-28', parsed, 31), true);
  assert.equal(dateWithinComparableCutoff('2026-04-01', parsed, 31), false);
});
