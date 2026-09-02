import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRelativePerformance } from '../lib/relative-performance/buildRelativePerformance.js';
import {
  currentMonthSantiago,
  parseRelativePerformanceInput,
} from '../lib/relative-performance/relativePerformanceInput.js';

function storeRow(month, sales, share) {
  return { month, sucursal_id: '1', sales, cidef_sales: 100, share_of_cidef: share };
}

function sellerRow(month, sales, share) {
  return {
    month,
    sucursal_id: '1',
    persona_id: '63',
    sales,
    store_sales: 100,
    share_of_store: share,
  };
}

test('tienda uses certified median_3 and returns reconciled productive row', () => {
  const parsed = parseRelativePerformanceInput({
    grain: 'tienda', start_month: '2026-04', end_month: '2026-04',
  });
  const context = {
    store_monthly: [
      storeRow('2026-01', 10, 0.10), storeRow('2026-02', 20, 0.20),
      storeRow('2026-03', 30, 0.30), storeRow('2026-04', 40, 0.40),
    ],
    seller_monthly: [], validation: { ok: true }, warnings: [],
  };
  const result = calculateRelativePerformance(context, parsed);
  const row = result.rows[0];
  assert.equal(result.validation.ok, true);
  assert.equal(result.certified_rule.baseline, 'median_3');
  assert.equal(row.expected_share, 0.20);
  assert.ok(Math.abs(row.relative_gap_pp - 20) < 1e-10);
  assert.equal(row.evaluable, true);
  assert.equal('persona_id' in row, false);
});

test('missing exact lag keeps observed row but nulls expectation and gap', () => {
  const parsed = parseRelativePerformanceInput({
    grain: 'tienda', start_month: '2026-04', end_month: '2026-04',
  });
  const context = {
    store_monthly: [storeRow('2026-01', 10, 0.10), storeRow('2026-03', 30, 0.30), storeRow('2026-04', 40, 0.40)],
    seller_monthly: [], validation: { ok: true }, warnings: [],
  };
  const result = calculateRelativePerformance(context, parsed);
  assert.equal(result.validation.ok, true);
  assert.equal(result.rows[0].evaluable, false);
  assert.equal(result.rows[0].expected_share, null);
  assert.equal(result.rows[0].relative_gap_pp, null);
});

test('vendedor uses certified moving_average_5 and store plus persona grain', () => {
  const parsed = parseRelativePerformanceInput({
    grain: 'vendedor', start_month: '2026-06', end_month: '2026-06',
  });
  const context = {
    store_monthly: [],
    seller_monthly: [1, 2, 3, 4, 5, 6].map((month) =>
      sellerRow(`2026-0${month}`, month * 10, month / 10)),
    validation: { ok: true }, warnings: [],
  };
  const result = calculateRelativePerformance(context, parsed);
  const row = result.rows[0];
  assert.equal(result.validation.ok, true);
  assert.equal(result.certified_rule.baseline, 'moving_average_5');
  assert.ok(Math.abs(row.expected_share - 0.30) < 1e-10);
  assert.ok(Math.abs(row.relative_gap_pp - 30) < 1e-10);
  assert.equal(row.persona_id, '63');
});

test('input contract rejects open month and laboratory knobs', () => {
  const current = currentMonthSantiago();
  assert.throws(() => parseRelativePerformanceInput({
    grain: 'tienda', start_month: current, end_month: current,
  }), /closed calendar month/);
  assert.throws(() => parseRelativePerformanceInput({
    grain: 'tienda', start_month: '2026-04', end_month: '2026-04',
    candidate_baselines: ['median_3'],
  }), /Unsupported input/);
});
