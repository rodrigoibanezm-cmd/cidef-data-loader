import test from 'node:test';
import assert from 'node:assert/strict';
import { execute as monthly } from '../lib/motors/monthly-seasonality-analysis.js';
import { execute as weekly } from '../lib/motors/intramonth-week-curve.js';
import { getMotor } from '../lib/motors/index.js';

function mockDb(calls = []) {
  return { query: async (query, params = []) => {
    calls.push({ query, params });
    if (query.includes('seasonality_stats')) return [{
      date_from: '2025-01', date_to: '2026-07', total_groups: '2',
    }];
    if (query.includes('cidef_coverage')) return [{
      rvm_cidef: '100', matched: '96', unmatched: '4', match_pct: '96.00',
    }];
    if (query.includes('monthly_seasonality')) return [{
      year_month: '2026-03', year: '2026', quarter: '1', month_number: '3',
      group_value: 'TOTAL', units: '30', annual_weight_pct: '8.1',
      quarter_weight_pct: '32', deviation_vs_month_avg_pct: '-5', ranking_in_year: '8',
    }];
    return [{
      year_month: '2026-07', group_value: 'TOTAL', units: '100',
      share_w1_pct: '20', share_w2_pct: '20', share_w3_pct: '20',
      share_w4_pct: '25', share_w5_pct: '15', last_week_share_pct: '15',
      last_7_days_share_pct: '30',
    }];
  } };
}

const cases = [
  ['MARKET', 'TOTAL'], ['MARKET', 'MARCA'], ['MARKET', 'MODELO'],
  ['CIDEF', 'TOTAL'], ['CIDEF', 'SUCURSAL'], ['CIDEF', 'VENDEDOR'],
];

test('monthly motor supports every required scope and group contract', async () => {
  for (const [scope, group_by] of cases) {
    const result = await monthly({ scope, group_by }, mockDb());
    assert.equal(result.scope, scope);
    assert.equal(result.group_by, group_by);
    assert.equal(typeof result.series[0].units, 'number');
    assert.equal(scope === 'CIDEF' ? result.coverage.match_pct : result.coverage, scope === 'CIDEF' ? 96 : null);
  }
});

test('week motor supports every required scope and group contract', async () => {
  for (const [scope, group_by] of cases) {
    const result = await weekly({ scope, group_by }, mockDb());
    assert.equal(result.scope, scope);
    assert.equal(result.group_by, group_by);
    assert.equal(typeof result.series[0].last_7_days_share_pct, 'number');
    assert.equal(scope === 'CIDEF' ? result.coverage.unmatched : result.coverage, scope === 'CIDEF' ? 4 : null);
  }
});

test('filters use stable parameters before aggregation and coverage excludes entity filters', async () => {
  const calls = [];
  await weekly({ scope: 'CIDEF', group_by: 'SUCURSAL', brand: 'FOTON', model: 'A',
    branch: 'NORTE', seller: 'ANA', date_from: '2026-01', date_to: '2026-02' }, mockDb(calls));
  assert.deepEqual(calls[0].params, ['2026-01-01', '2026-03-01', 'FOTON', 'A', 'NORTE', 'ANA']);
  assert.deepEqual(calls[1].params.slice(0, 6), calls[0].params);
  assert.deepEqual(calls[2].params, ['2026-01-01', '2026-03-01', 'FOTON', 'A']);
});

test('grouped output exposes explicit pagination and TOTAL does not truncate', async () => {
  const grouped = await monthly({ scope: 'MARKET', group_by: 'MARCA', page_size: 1 }, mockDb());
  assert.deepEqual(grouped.pagination, { page: 1, page_size: 1, total_groups: 2, total_pages: 2 });
  assert.equal((await monthly({ scope: 'MARKET' }, mockDb())).pagination, null);
});

test('MARKET TOTAL without optional filters has contiguous typed parameters', async () => {
  for (const execute of [monthly, weekly]) {
    const calls = [];
    await execute({ scope: 'MARKET', group_by: 'TOTAL' }, mockDb(calls));
    assert.deepEqual(calls[0].params, [null, null, null, null]);
    assert.deepEqual(calls[1].params, [null, null, null, null, 1, 0]);
    assert.match(calls[1].query, /LIMIT \$5::integer OFFSET \$6::integer/);
    assert.doesNotMatch(calls[1].query, /\$7|\$8/);
  }
});

test('both motors are registered under their exact public names', () => {
  assert.equal(typeof getMotor('monthly_seasonality_analysis'), 'function');
  assert.equal(typeof getMotor('intramonth_week_curve'), 'function');
});
