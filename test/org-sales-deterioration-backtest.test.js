import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrgBacktestRows } from '../lib/deterioration/buildOrgBacktestRows.js';
import { parseOrgDeteriorationInput } from '../lib/deterioration/orgDeteriorationInput.js';
import { evaluatePersistence } from '../lib/deterioration/orgPersistence.js';

test('org deterioration input requires canonical grain and month range', () => {
  const parsed = parseOrgDeteriorationInput({
    grain: 'tienda', start_month: '2026-03', end_month: '2026-04',
    candidate_baselines: ['last_year'], candidate_deviation_methods: ['relative'],
    candidate_persistence_rules: ['consecutive_2'],
  });
  assert.equal(parsed.grain, 'tienda');
  assert.deepEqual(parsed.baselines, ['last_year']);
  assert.throws(() => parseOrgDeteriorationInput({ grain: 'supervisor' }));
});

test('walk-forward row uses prior cutoff baseline and current cutoff actual', () => {
  const historyUnit = {
    unit_id: 1, unit_label: 'Tienda A', identity_validated: true,
    months: new Map([['2025-03', 10]]),
  };
  const actualUnit = { ...historyUnit, months: new Map([['2025-03', 10], ['2026-03', 5]]) };
  const snapshots = new Map([
    ['2026-02', { units: new Map([['1', historyUnit]]) }],
    ['2026-03', { units: new Map([['1', actualUnit]]) }],
  ]);
  const result = buildOrgBacktestRows({ snapshots }, {
    grain: 'tienda', startMonth: '2026-03', endMonth: '2026-03', baselines: ['last_year'],
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].baseline_value, 10);
  assert.equal(result.rows[0].sales, 5);
  assert.equal(result.rows[0].deviations.error, -5);
});

test('persistence requires contiguous adverse months', () => {
  const rows = [
    { month: '2026-01', deviations: { relative: -0.1, error: -1 } },
    { month: '2026-02', deviations: { relative: -0.2, error: -2 } },
  ];
  assert.equal(evaluatePersistence('consecutive_2', rows.slice(0, 1), 'relative'), null);
  assert.deepEqual(evaluatePersistence('consecutive_2', rows, 'relative'), {
    onset_month: '2026-01', evidence_months: ['2026-01', '2026-02'],
  });
  const gap = [rows[0], { month: '2026-03', deviations: { relative: -0.2, error: -2 } }];
  assert.equal(evaluatePersistence('consecutive_2', gap, 'relative'), null);
});

test('pre-window errors seed robust deviation history', () => {
  const snapshots = new Map([['2023-12', { units: new Map() }]]);
  const months = [];
  for (let year = 2024; year <= 2026; year += 1) for (let month = 1; month <= 12; month += 1) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > '2026-04') break;
    months.push(key);
  }
  months.forEach((cutoff, index) => {
    const values = new Map(months.slice(0, index + 1).map((month, i) => [month, 10 + (i % 2)]));
    const unit = { unit_id: 1, unit_label: 'Tienda A', identity_validated: true, months: values };
    snapshots.set(cutoff, { units: new Map([['1', unit]]) });
  });
  const result = buildOrgBacktestRows({ snapshots, first_data_month: '2024-01' }, {
    grain: 'tienda', startMonth: '2026-04', endMonth: '2026-04', baselines: ['last_year'],
  });
  assert.equal(result.rows.length, 1);
  assert.ok(result.rows[0].deviations.error_history_available >= 3);
});
