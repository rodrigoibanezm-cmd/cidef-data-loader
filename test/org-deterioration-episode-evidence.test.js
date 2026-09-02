import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEpisodeEvidence } from '../lib/deterioration/buildEpisodeEvidence.js';
import { parseEpisodeEvidenceInput } from '../lib/deterioration/episodeEvidenceInput.js';
import { listCustomGptActions } from '../lib/custom-gpt-router.js';

function input(overrides = {}) {
  return {
    grain: 'tienda', start_month: '2025-01', end_month: '2026-07',
    candidate_baselines: ['moving_average_12'],
    candidate_deviation_methods: ['historical_percentile'],
    candidate_persistence_rules: ['deepening_2'],
    context_months: 2,
    ...overrides,
  };
}

function row(month, sales, baseline, error, percentile) {
  return {
    unit_id: 7, unit_label: 'Tienda A', baseline: 'moving_average_12', month,
    sales, baseline_value: baseline,
    deviations: {
      error, historical_percentile: percentile, scaled_mad: null, relative: error / baseline,
      error_history_available: 10,
    },
  };
}

test('episode evidence requires one exact candidate and bounded context', () => {
  const parsed = parseEpisodeEvidenceInput(input());
  assert.equal(parsed.contextMonths, 2);
  assert.throws(() => parseEpisodeEvidenceInput(input({
    candidate_deviation_methods: ['historical_percentile', 'scaled_mad'],
  })));
  assert.throws(() => parseEpisodeEvidenceInput(input({ context_months: 13 })));
});

test('episode evidence exposes ex-ante rows separately from future outcome', () => {
  const parsed = parseEpisodeEvidenceInput(input());
  const rows = [
    row('2025-09', 21, 20, 1, 0.7),
    row('2025-10', 19, 20, -1, 0.45),
    row('2025-11', 15, 20, -5, 0.2),
    row('2025-12', 10, 20, -10, 0.1),
    row('2026-01', 8, 20, -12, 0.05),
  ];
  const episodes = [{
    unit_id: 7, unit_label: 'Tienda A', baseline: 'moving_average_12',
    deviation_method: 'historical_percentile', persistence_rule: 'deepening_2',
    onset_month: '2025-11', confirmation_month: '2025-12',
    evidence_months: ['2025-11', '2025-12'], lead_periods: 1,
    next_error: -12, next_reverted: false,
    next_2_all_negative: null, next_3_all_negative: null,
  }];
  const result = buildEpisodeEvidence(rows, episodes, parsed);
  const evidence = result.episode_evidence[0];
  assert.deepEqual(
    evidence.signal_evidence.pre_onset_context.map((item) => item.month),
    ['2025-09', '2025-10'],
  );
  assert.equal(evidence.signal_evidence.onset.sales, 15);
  assert.equal(evidence.signal_evidence.confirmation.baseline, 20);
  assert.equal(evidence.signal_evidence.confirmation.deviation_value, 0.1);
  assert.deepEqual(
    evidence.signal_evidence.persistence_rows.map((item) => item.error),
    [-5, -10],
  );
  assert.equal(evidence.future_evaluation.next_error, -12);
  assert.equal(result.validation.episode_signal_evidence_complete, true);
  assert.equal(result.validation.signal_context_uses_no_future_rows, true);
});

test('episode evidence action is registered for custom gpt', () => {
  assert.ok(listCustomGptActions().includes('org_sales_deterioration_episode_evidence_v01'));
});
