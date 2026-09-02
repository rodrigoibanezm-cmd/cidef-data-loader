import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateShareExpectationBacktest } from '../lib/share-expectation/buildShareExpectationBacktest.js';
import { calculateShareExpectation } from '../lib/share-expectation/shareCandidates.js';
import { parseShareBacktestInput } from '../lib/share-expectation/shareBacktestInput.js';

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

test('seller backtest keeps store in unit grain and ranks on common evaluable rows', () => {
  const sellerMonthly = [];
  for (const sucursalId of ['1', '2']) {
    for (let month = 1; month <= 4; month += 1) {
      sellerMonthly.push({
        month: `2026-0${month}`,
        sucursal_id: sucursalId,
        persona_id: '63',
        share_of_store: sucursalId === '1' ? 0.40 + month * 0.01 : 0.20 + month * 0.01,
      });
    }
  }
  const parsed = parseShareBacktestInput({
    grain: 'vendedor',
    start_month: '2026-03',
    end_month: '2026-04',
    candidate_baselines: ['moving_average_1', 'median_2'],
  });
  const context = { seller_monthly: sellerMonthly, store_monthly: [], validation: { ok: true } };
  const result = calculateShareExpectationBacktest(context, parsed);

  assert.equal(result.validation.ok, true);
  assert.equal(result.coverage.target_rows, 4);
  assert.equal(result.coverage.common_evaluable_rows, 4);
  assert.equal(new Set(result.monthly_backtest.map((row) => row.unit_key)).size, 2);
  assert.ok(result.monthly_backtest.some((row) => row.unit_key === '1|63'));
  assert.ok(result.monthly_backtest.some((row) => row.unit_key === '2|63'));
  assert.equal(result.ranking.length, 2);
  assert.equal(result.ranking.every((row) => row.common_metrics.rows_evaluated === 4), true);
});
