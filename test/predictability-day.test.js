import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePredictabilityDayFromBacktest } from '../lib/motors/predictability-day-v01.js';
import { derivePredictabilityDays } from '../lib/predictability-day/findPredictabilityDay.js';
import { parsePredictabilityThresholds } from '../lib/predictability-day/parseThresholds.js';

function row(grain, day, median, p90, evaluable = 10) {
  return {
    grain,
    day_of_month: day,
    targets_evaluable: evaluable,
    median_ape_pct: median,
    p90_ape_pct: p90,
  };
}

test('defaults are 20/40 and can be overridden', () => {
  assert.deepEqual(parsePredictabilityThresholds({}), { median_ape_pct: 20, p90_ape_pct: 40 });
  assert.deepEqual(
    parsePredictabilityThresholds({ median_ape_threshold_pct: 15, p90_ape_threshold_pct: 30 }),
    { median_ape_pct: 15, p90_ape_pct: 30 },
  );
});

test('requires threshold permanence through later evaluable days', () => {
  const rows = [
    row('CIDEF_PROPIO', 20, 18, 38),
    row('CIDEF_PROPIO', 21, 19, 42),
    row('CIDEF_PROPIO', 22, 17, 36),
    row('CIDEF_PROPIO', 23, 16, 35),
    row('TIENDA_PROPIA_POOLED', 26, 15, 45),
    row('TIENDA_PROPIA_POOLED', 27, 14, 39),
    row('TIENDA_PROPIA_POOLED', 28, 13, 36),
  ];
  const result = derivePredictabilityDays(rows, { median_ape_pct: 20, p90_ape_pct: 40 });
  assert.equal(result[0].first_day_meeting_thresholds, 20);
  assert.equal(result[0].predictability_day, 22);
  assert.equal(result[1].predictability_day, 27);
});

test('motor summarizes a valid backtest without copying full curve', () => {
  const candidateResults = [
    row('CIDEF_PROPIO', 22, 17.9, 36), row('CIDEF_PROPIO', 23, 17.6, 37.1),
    row('TIENDA_PROPIA_POOLED', 27, 13.8, 39.3), row('TIENDA_PROPIA_POOLED', 28, 13.6, 35.6),
  ];
  const result = calculatePredictabilityDayFromBacktest({
    version: '0.1', status: 'ok', warnings: [], coverage: {}, candidate_results: candidateResults,
  }, { start_month: '2021-01', end_month: '2026-08' });
  assert.equal(result.status, 'ok');
  assert.equal(result.results[0].predictability_day, 22);
  assert.equal(result.results[1].predictability_day, 27);
  assert.equal(result.validation.criterion_maintained_through_close, true);
});

test('returns warning when a grain never reaches the rule', () => {
  const rows = [
    row('CIDEF_PROPIO', 30, 7, 34),
    row('TIENDA_PROPIA_POOLED', 30, 15, 45),
  ];
  const result = calculatePredictabilityDayFromBacktest({
    version: '0.1', status: 'ok', warnings: [], coverage: {}, candidate_results: rows,
  }, { start_month: '2021-01', end_month: '2026-08' });
  assert.equal(result.status, 'warning');
  assert.equal(result.results[1].predictability_day, null);
});
