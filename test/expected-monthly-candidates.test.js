import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpectedMonthlyCandidates } from '../lib/motors/expected-monthly-candidates-v01.js';

const monthlySales = [
  { month: '2025-04', sales: 100 },
  { month: '2025-05', sales: 120 },
  { month: '2025-06', sales: 140 },
  { month: '2025-07', sales: 160 },
  { month: '2026-01', sales: 180 },
  { month: '2026-02', sales: 200 },
  { month: '2026-03', sales: 220 },
  { month: '2026-04', sales: 240 },
  { month: '2026-05', sales: 260 },
  { month: '2026-06', sales: 280 },
  { month: '2026-07', sales: 999 },
  { month: '2026-08', sales: 999 },
];

test('calculates all candidates without using target or future months', () => {
  const result = calculateExpectedMonthlyCandidates(
    { cutoff_month: '2026-06', monthlySales },
    { cutoff_month: '2026-06', target_month: '2026-07' },
  );

  assert.equal(result.status, 'ok');
  assert.equal(result.expectations.last_year, 160);
  assert.equal(result.expectations.moving_average_3, 260);
  assert.equal(result.expectations.moving_average_6, 230);
  assert.ok(Math.abs(result.expectations.adjusted_last_year - (160 * 260 / 120)) < 1e-9);
  assert.equal(result.coverage.last_source_month, '2026-06');
  assert.equal(result.validation.no_target_month_used, true);
  assert.equal(result.validation.no_future_month_used, true);
  assert.equal('actual' in result, false);
});

test('requires target month immediately after cutoff', () => {
  assert.throws(
    () => calculateExpectedMonthlyCandidates(
      { cutoff_month: '2026-06', monthlySales },
      { cutoff_month: '2026-06', target_month: '2026-08' },
    ),
    /immediately after cutoff_month/,
  );
});
