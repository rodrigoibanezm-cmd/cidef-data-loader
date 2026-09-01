import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrgBacktestRows } from '../lib/deterioration/buildOrgBacktestRows.js';
import { calculateBaseline } from '../lib/deterioration/orgBaselines.js';
import { parseOrgDeteriorationInput } from '../lib/deterioration/orgDeteriorationInput.js';
import { evaluatePersistence } from '../lib/deterioration/orgPersistence.js';

test('org deterioration input requires canonical grain and caller candidates', () => {
  const parsed = parseOrgDeteriorationInput({
    grain: 'tienda', start_month: '2026-03', end_month: '2026-04',
    candidate_baselines: ['moving_average_5'], candidate_deviation_methods: ['relative'],
    candidate_persistence_rules: ['frequency_3_of_5'],
  });
  assert.deepEqual(parsed.baselines, ['moving_average_5']);
  assert.deepEqual(parsed.persistence, ['frequency_3_of_5']);
  assert.throws(() => parseOrgDeteriorationInput({ grain: 'supervisor' }));
  assert.throws(() => parseOrgDeteriorationInput({
    grain: 'tienda', start_month: '2026-03', end_month: '2026-04',
    candidate_baselines: ['median_0'], candidate_deviation_methods: ['relative'],
    candidate_persistence_rules: ['consecutive_2'],
  }));
});

test('parameterized baseline uses caller window', () => {
  const unit = {
    unit_id: 1, unit_label: 'Tienda A', identity_validated: true,
    months: new Map([
      ['2026-01', 1], ['2026-02', 2], ['2026-03', 3], ['2026-04', 4], ['2026-05', 5],
    ]),
  };
  assert.equal(calculateBaseline('moving_average_3', unit, '2026-06').value, 4);
  assert.equal(calculateBaseline('median_5', unit, '2026-06').value, 3);
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

test('persistence requires contiguous adverse months and supports dynamic window', () => {
  const rows = ['2026-01', '2026-02', '2026-03'].map((month, index) => ({
    month, deviations: { relative: -0.1, error: -(index + 1) },
  }));
  assert.equal(evaluatePersistence('consecutive_3', rows.slice(0, 2), 'relative'), null);
  assert.equal(evaluatePersistence('deepening_3', rows, 'relative').onset_month, '2026-01');
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
