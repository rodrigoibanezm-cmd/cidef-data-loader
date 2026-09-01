import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasMonthlyActual } from '../lib/motors/ventas-monthly-actual-v01.js';

function context(overrides = {}) {
  return {
    cutoff_month: '2026-07',
    monthlySales: [
      { month: '2026-06', sales: 887 },
      { month: '2026-07', sales: 939 },
    ],
    coverage: { source_rows: 100, rows_inside_cutoff: 90, rows_excluded_by_cutoff: 10 },
    validation: { ok: true },
    warnings: [],
    ...overrides,
  };
}

test('returns target month actual from a cutoff-compatible ventas context', () => {
  const result = calculateVentasMonthlyActual(context(), {
    cutoffMonth: '2026-07',
    targetMonth: '2026-07',
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.actual.month, '2026-07');
  assert.equal(result.actual.sales, 939);
  assert.equal(result.validation.target_within_cutoff, true);
  assert.equal(result.validation.no_post_cutoff_evidence_used, true);
});

test('rejects a shared context built with a different cutoff', () => {
  assert.throws(() => calculateVentasMonthlyActual(context({ cutoff_month: '2026-08' }), {
    cutoffMonth: '2026-07',
    targetMonth: '2026-07',
  }), /cutoff does not match/);
});

test('warns when target month is absent from the recognized monthly series', () => {
  const result = calculateVentasMonthlyActual(context({ monthlySales: [] }), {
    cutoffMonth: '2026-07',
    targetMonth: '2026-07',
  });

  assert.equal(result.status, 'warning');
  assert.equal(result.actual.sales, null);
  assert.equal(result.validation.target_month_present, false);
});
