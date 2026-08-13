import test from 'node:test';
import assert from 'node:assert/strict';
import { weekSeriesOutput, weekSummaryOutput } from '../lib/intramonth-week-output.js';

const row = (month, shares, last7) => ({
  year_month: month, group_value: 'TOTAL', units: '100',
  share_w1_pct: String(shares[0]), share_w2_pct: String(shares[1]),
  share_w3_pct: String(shares[2]), share_w4_pct: String(shares[3]),
  share_w5_pct: String(shares[4]), last_week_share_pct: String(shares[4]),
  last_7_days_share_pct: String(last7),
});

test('W1-W5 series values are numeric and sum to 100', () => {
  const [result] = weekSeriesOutput([row('2026-07', [20, 20, 20, 25, 15], 30)]);
  const total = [1, 2, 3, 4, 5].reduce((sum, week) => sum + result[`share_w${week}_pct`], 0);
  assert.equal(total, 100);
  assert.equal(result.last_week_share_pct, 15);
  assert.equal(result.last_7_days_share_pct, 30);
});

test('a 28-day month can represent W5 as zero without changing last seven days', () => {
  const [result] = weekSeriesOutput([row('2026-02', [20, 20, 20, 40, 0], 25)]);
  assert.equal(result.share_w5_pct, 0);
  assert.equal(result.last_7_days_share_pct, 25);
});

test('summary returns equal-month averages plus median, min and max', () => {
  const series = weekSeriesOutput([
    row('2026-01', [10, 20, 30, 30, 10], 20),
    row('2026-02', [20, 20, 20, 40, 0], 30),
    row('2026-03', [30, 20, 20, 20, 10], 40),
  ]);
  const [summary] = weekSummaryOutput(series);
  assert.equal(summary.months_observed, 3);
  assert.equal(summary.avg_share_w1_pct, 20);
  assert.equal(summary.avg_last_7_days_share_pct, 30);
  assert.equal(summary.median_last_7_days_share_pct, 30);
  assert.equal(summary.min_last_7_days_share_pct, 20);
  assert.equal(summary.max_last_7_days_share_pct, 40);
});

test('summaries never combine different group values', () => {
  const other = { ...row('2026-01', [20, 20, 20, 20, 20], 20), group_value: 'FOTON' };
  assert.equal(weekSummaryOutput(weekSeriesOutput([row('2026-01', [20, 20, 20, 20, 20], 20), other])).length, 2);
});
