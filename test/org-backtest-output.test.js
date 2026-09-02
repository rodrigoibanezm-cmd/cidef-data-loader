import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOrgBacktestOutput } from '../lib/deterioration/formatOrgBacktestOutput.js';
import { parseOrgDeteriorationInput } from '../lib/deterioration/orgDeteriorationInput.js';

const input = {
  grain: 'tienda',
  start_month: '2025-01',
  end_month: '2026-07',
  candidate_baselines: ['last_year'],
  candidate_deviation_methods: ['relative'],
  candidate_persistence_rules: ['consecutive_2'],
};

const result = {
  status: 'ok', identity_audit: { resolved: 10 }, coverage: { evaluable_rows: 12 },
  warnings: [], validation: { has_evaluable_rows: true },
  monthly_series_coverage: [
    { cutoff_month: '2025-01', units: 2, recognized: 3, resolved: 3, unresolved: 0, ambiguous: 0 },
    { cutoff_month: '2025-02', units: 3, recognized: 4, resolved: 4, unresolved: 0, ambiguous: 0 },
  ],
  candidate_results: [{
    baseline: 'last_year', deviation_method: 'relative', persistence_rule: 'consecutive_2',
    episodes: 2, immediate_reversal_rate: 0, next_2_persistent_rate: 1,
  }],
  unit_backtests: [
    { baseline: 'last_year', deviation_method: 'relative', persistence_rule: 'consecutive_2', unit_id: 1 },
    { baseline: 'last_year', deviation_method: 'scaled_mad', persistence_rule: 'consecutive_2', unit_id: 2 },
  ],
  episode_backtests: [
    { baseline: 'last_year', deviation_method: 'relative', persistence_rule: 'consecutive_2', unit_id: 1 },
    { baseline: 'last_year', deviation_method: 'relative', persistence_rule: 'consecutive_2', unit_id: 2 },
  ],
  rolling_year_stability: [
    { year: '2025', baseline: 'last_year', deviation_method: 'relative', persistence_rule: 'consecutive_2', episodes: 1, immediate_reversal_rate: 0, next_2_persistent_rate: 1, next_3_persistent_rate: 1 },
    { year: '2026', baseline: 'last_year', deviation_method: 'relative', persistence_rule: 'consecutive_2', episodes: 2, immediate_reversal_rate: 0.5, next_2_persistent_rate: 0.5, next_3_persistent_rate: 0.5 },
  ],
};

test('summary output is compact and omits raw detail arrays', () => {
  const output = formatOrgBacktestOutput(result, parseOrgDeteriorationInput(input));
  assert.equal(output.monthly_series_coverage.periods, 2);
  assert.equal(output.candidate_results.length, 1);
  assert.equal(output.rolling_year_stability.length, 1);
  assert.equal(output.episode_backtests, undefined);
  assert.equal(output.unit_backtests, undefined);
});

test('episode detail is bounded and reports truncation', () => {
  const parsed = parseOrgDeteriorationInput({ ...input, output_mode: 'episodes', detail_limit: 1 });
  const output = formatOrgBacktestOutput(result, parsed);
  assert.equal(output.episode_backtests.length, 1);
  assert.equal(output.detail.matched_rows, 2);
  assert.equal(output.detail.truncated, true);
});

test('unit detail applies candidate filters before limit', () => {
  const parsed = parseOrgDeteriorationInput({
    ...input, output_mode: 'units', detail_limit: 1, detail_deviation_method: 'relative',
  });
  const output = formatOrgBacktestOutput(result, parsed);
  assert.equal(output.unit_backtests.length, 1);
  assert.equal(output.unit_backtests[0].deviation_method, 'relative');
  assert.equal(output.detail.matched_rows, 1);
  assert.equal(output.detail.truncated, false);
});

test('detail filters must belong to requested candidates', () => {
  assert.throws(() => parseOrgDeteriorationInput({
    ...input, output_mode: 'episodes', detail_baseline: 'moving_average_3',
  }));
});
