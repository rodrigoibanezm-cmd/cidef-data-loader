import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateShareExpectationBacktest } from '../lib/share-expectation/buildShareExpectationBacktest.js';
import { calculateShareExpectation } from '../lib/share-expectation/shareCandidates.js';
import { parseShareBacktestInput } from '../lib/share-expectation/shareBacktestInput.js';
import { formatShareBacktestOutput } from '../lib/share-expectation/formatShareBacktestOutput.js';

test('share candidates require exact calendar months and never skip missing history', () => {
  const index = new Map([
    ['2026-01', 0.40],
    ['2026-03', 0.50],
  ]);
  const candidate = { name: 'moving_average_2', type: 'moving_average', window: 2, lag: 2 };
  const result = calculateShareExpectation(candidate, '2026-04', index);

  assert.equal(result.evaluable, false);
  assert.equal(result.expected, null);
  assert.deepEqual(result.source_months, ['2026-03', '2026-02']);
});

test('monthly detail keeps relative gap null when expectation is unavailable', () => {
  const parsed = parseShareBacktestInput({
    grain: 'tienda',
    start_month: '2026-02',
    end_month: '2026-02',
    candidate_baselines: ['moving_average_2'],
    output_mode: 'monthly',
  });
  const context = {
    store_monthly: [
      { month: '2026-01', sucursal_id: '1', sales: 40, cidef_sales: 100, share_of_cidef: 0.40 },
      { month: '2026-02', sucursal_id: '1', sales: 50, cidef_sales: 100, share_of_cidef: 0.50 },
    ],
    seller_monthly: [],
    validation: { ok: true },
  };
  const result = calculateShareExpectationBacktest(context, parsed);
  const output = formatShareBacktestOutput(result, parsed);
  const row = output.monthly_backtest[0];

  assert.equal(row.evaluable, false);
  assert.equal(row.expected_share, null);
  assert.equal(row.relative_gap_pp, null);
});

test('seller backtest keeps store grain, distributions and sales evidence', () => {
  const sellerMonthly = [];
  for (const sucursalId of ['1', '2']) {
    for (let month = 1; month <= 4; month += 1) {
      const share = sucursalId === '1' ? 0.40 + month * 0.01 : 0.20 + month * 0.01;
      sellerMonthly.push({
        month: `2026-0${month}`,
        sucursal_id: sucursalId,
        persona_id: '63',
        sales: Math.round(share * 100),
        store_sales: 100,
        share_of_store: share,
      });
    }
  }
  const parsed = parseShareBacktestInput({
    grain: 'vendedor',
    start_month: '2026-03',
    end_month: '2026-04',
    candidate_baselines: ['moving_average_2'],
    output_mode: 'monthly',
  });
  const context = { seller_monthly: sellerMonthly, store_monthly: [], validation: { ok: true } };
  const result = calculateShareExpectationBacktest(context, parsed);
  const output = formatShareBacktestOutput(result, parsed);
  const distribution = result.candidate_results[0].relative_gap_distribution;
  const bias = result.candidate_results[0].candidate_specific_metrics.bias_pp;

  assert.equal(result.validation.ok, true);
  assert.equal(result.coverage.target_rows, 4);
  assert.equal(result.coverage.common_evaluable_rows, 4);
  assert.equal(new Set(result.monthly_backtest.map((row) => row.unit_key)).size, 2);
  assert.equal(distribution.rows, 4);
  assert.ok(Math.abs(distribution.mean_pp - bias) < 1e-10);
  assert.equal(output.monthly_backtest[0].sales > 0, true);
  assert.equal(output.monthly_backtest[0].parent_sales, 100);
  assert.equal(Number.isFinite(output.monthly_backtest[0].expected_share), true);
  assert.equal(Number.isFinite(output.monthly_backtest[0].relative_gap_pp), true);
});
