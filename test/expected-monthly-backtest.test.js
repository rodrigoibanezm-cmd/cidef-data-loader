import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpectedMonthlyBacktest } from '../lib/motors/expected-monthly-backtest-v01.js';

function monthKey(index) {
  const year = 2024 + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function context(values) {
  return {
    monthlySales: values.map((sales, index) => ({ month: monthKey(index), sales })),
    validation: { ok: true },
  };
}

test('uses one common evaluation window for every candidate', () => {
  const values = Array.from({ length: 30 }, (_, i) => 100 + i * 3);
  const result = calculateExpectedMonthlyBacktest(context(values));

  assert.equal(result.coverage.first_evaluable_month, '2025-04');
  assert.equal(result.coverage.months_evaluated, 15);
  assert.equal(result.validation.common_window_ok, true);
  assert.equal(result.ranking.length, 4);
  assert.ok(result.ranking.every((row) => row.months_evaluated === 15));
});

test('future months do not alter an earlier target prediction', () => {
  const base = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
  const changed = [...base];
  changed[24] = 99999;

  const first = calculateExpectedMonthlyBacktest(context(base));
  const second = calculateExpectedMonthlyBacktest(context(changed));
  const a = first.monthly_backtest.find((row) => row.month === '2025-04');
  const b = second.monthly_backtest.find((row) => row.month === '2025-04');

  assert.deepEqual(a.expected, b.expected);
});

test('ranking is deterministic and ordered by WAPE first', () => {
  const values = Array.from({ length: 36 }, (_, i) => {
    const seasonal = (i % 12) * 5;
    const yearLevel = Math.floor(i / 12) * 20;
    return 100 + seasonal + yearLevel;
  });
  const result = calculateExpectedMonthlyBacktest(context(values));

  assert.ok(result.winner);
  assert.equal(result.ranking[0].rank, 1);
  for (let i = 1; i < result.ranking.length; i += 1) {
    assert.ok(result.ranking[i - 1].wape <= result.ranking[i].wape);
  }
});
