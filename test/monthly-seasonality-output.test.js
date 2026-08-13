import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlySeriesOutput, monthlySummaryOutput } from '../lib/monthly-seasonality-output.js';

const row = (year, units, annual, quarter = 33.3333) => ({
  year_month: `${year}-03`, year: String(year), quarter: '1', month_number: '3',
  group_value: 'TOTAL', units: String(units), annual_weight_pct: String(annual),
  quarter_weight_pct: String(quarter), deviation_vs_month_avg_pct: '0',
  ranking_in_year: '4',
});

test('monthly series returns JSON numbers', () => {
  const [result] = monthlySeriesOutput([row(2025, 80, 8)]);
  for (const key of ['year', 'quarter', 'month_number', 'units', 'annual_weight_pct',
    'quarter_weight_pct', 'deviation_vs_month_avg_pct', 'ranking_in_year']) {
    assert.equal(typeof result[key], 'number', key);
  }
});

test('summary averages the same month across years and names it in Spanish', () => {
  const series = monthlySeriesOutput([row(2025, 80, 8), row(2026, 100, 10)]);
  const [summary] = monthlySummaryOutput(series);
  assert.deepEqual(summary, {
    group_value: 'TOTAL', month_number: 3, month_name: 'MARZO', avg_units: 90,
    avg_annual_weight_pct: 9, years_observed: 2, historical_trend_pct: 25,
  });
});

test('summary keeps groups independent', () => {
  const rows = [row(2025, 80, 8), { ...row(2025, 20, 2), group_value: 'FOTON' }];
  assert.equal(monthlySummaryOutput(monthlySeriesOutput(rows)).length, 2);
});

test('annual and quarterly share fixtures sum approximately 100 percent', () => {
  const series = monthlySeriesOutput([
    { ...row(2025, 1, 25, 33.3333), year_month: '2025-01', month_number: '1' },
    { ...row(2025, 1, 25, 33.3333), year_month: '2025-02', month_number: '2' },
    row(2025, 1, 25, 33.3334),
    { ...row(2025, 1, 25, 100), year_month: '2025-04', quarter: '2', month_number: '4' },
  ]);
  assert.ok(Math.abs(series.reduce((sum, item) => sum + item.annual_weight_pct, 0) - 100) < 0.001);
  assert.ok(Math.abs(series.filter(item => item.quarter === 1)
    .reduce((sum, item) => sum + item.quarter_weight_pct, 0) - 100) < 0.001);
});
