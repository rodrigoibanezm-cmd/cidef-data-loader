import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCandidateUnits } from '../lib/deterioration/summarizeCandidateUnits.js';

function row(month, sales, baselineValue, deviations = {}) {
  return {
    baseline: 'last_year', unit_id: 1, unit_label: 'A', identity_validated: true,
    month, sales, baseline_value: baselineValue,
    deviations: { error: sales - baselineValue, error_history_available: 4, ...deviations },
  };
}

const parsed = {
  baselines: ['last_year'], deviations: ['relative'], persistence: ['deepening_2'],
};

test('candidate x unit summary reconciles signals, episodes and future flags', () => {
  const rows = [
    row('2025-01', 8, 10, { relative: -0.2 }),
    row('2025-02', 7, 10, { relative: -0.3 }),
    row('2025-03', 11, 10, { relative: 0.1 }),
  ];
  const episodes = [{
    baseline: 'last_year', deviation_method: 'relative', persistence_rule: 'deepening_2',
    unit_id: 1, confirmation_month: '2025-02', next_reverted: true,
    next_2_all_negative: false, next_3_all_negative: null,
  }];
  const [unit] = summarizeCandidateUnits(rows, episodes, parsed);
  assert.equal(unit.baseline_evaluable_rows, 3);
  assert.equal(unit.deviation_evaluable_rows, 3);
  assert.deepEqual(unit.signal_months, ['2025-01', '2025-02']);
  assert.equal(unit.signal_count, 2);
  assert.equal(unit.confirmed_episode_count, 1);
  assert.deepEqual(unit.confirmation_months, ['2025-02']);
  assert.equal(unit.immediate_reversal_count, 1);
  assert.equal(unit.immediate_reversal_rate, 1);
  assert.equal(unit.next_2_persistent_count, 0);
  assert.equal(unit.next_2_persistent_rate, 0);
  assert.equal(unit.next_3_persistent_rate, null);
  assert.equal(unit.actual_sales_avg, 26 / 3);
});

test('candidate x unit grain separates deviation methods', () => {
  const rows = [row('2025-01', 8, 10, { relative: -0.2, scaled_mad: -1 })];
  const units = summarizeCandidateUnits(rows, [], {
    baselines: ['last_year'], deviations: ['relative', 'scaled_mad'], persistence: ['deepening_2'],
  });
  assert.equal(units.length, 2);
  assert.deepEqual(units.map((unit) => unit.deviation_method).sort(), ['relative', 'scaled_mad']);
});

test('relative reports baseline nonpositive without changing baseline universe', () => {
  const rows = [row('2025-01', 0, 0, { relative: null })];
  const [unit] = summarizeCandidateUnits(rows, [], parsed);
  assert.equal(unit.baseline_evaluable_rows, 1);
  assert.equal(unit.deviation_evaluable_rows, 0);
  assert.equal(unit.deviation_unavailable_rows, 1);
  assert.equal(unit.deviation_unavailable_reasons.baseline_nonpositive, 1);
});

test('scaled mad separates insufficient history from zero scale', () => {
  const rows = [
    row('2025-01', 8, 10, { scaled_mad: null, error_history_available: 2 }),
    row('2025-02', 8, 10, { scaled_mad: null, error_history_available: 3 }),
    row('2025-03', 8, 10, { scaled_mad: -2, error_history_available: 4 }),
  ];
  const [unit] = summarizeCandidateUnits(rows, [], {
    baselines: ['last_year'], deviations: ['scaled_mad'], persistence: ['deepening_2'],
  });
  assert.equal(unit.deviation_evaluable_rows, 1);
  assert.equal(unit.deviation_unavailable_rows, 2);
  assert.equal(unit.deviation_unavailable_reasons.insufficient_error_history, 1);
  assert.equal(unit.deviation_unavailable_reasons.zero_scale, 1);
  assert.equal(unit.signal_count, 1);
});
