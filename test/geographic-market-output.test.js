import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesOutput, summaryOutput } from '../lib/geographic-market-output.js';

const row = (period_key, geography, share, ranking) => ({
  period_key, geography, marca: 'FOTON', brand_units: '10',
  universe_units: '100', share_pct: String(share), ranking: String(ranking),
});

test('summary returns JSON numbers and positive ranking delta for improvement', () => {
  const [result] = summaryOutput([row('current', 'A', 10, 3), row('comparison', 'A', 8.5, 5)], true);
  assert.equal(typeof result.unidades_marca, 'number');
  assert.equal(typeof result.unidades_universo, 'number');
  assert.equal(typeof result.share_pct, 'number');
  assert.equal(typeof result.ranking, 'number');
  assert.equal(result.delta_pp, 1.5);
  assert.equal(result.ranking_delta, 2);
  assert.equal(result.trend, 'UP');
});

test('trend classifies DOWN, FLAT and missing comparison', () => {
  const down = summaryOutput([row('current', 'A', 7, 5), row('comparison', 'A', 8, 4)], true)[0];
  const flat = summaryOutput([row('current', 'B', 8.53, 4), row('comparison', 'B', 8.5, 4)], true)[0];
  const none = summaryOutput([row('current', 'C', 8, 4)], false)[0];
  assert.equal(down.trend, 'DOWN');
  assert.equal(flat.trend, 'FLAT');
  assert.equal(none.trend, null);
});

test('monthly series preserves the required grain with numeric metrics', () => {
  const [result] = seriesOutput([{ ...row('current', 'A', 10, 3), year_month: '2026-07' }]);
  assert.deepEqual(result, {
    year_month: '2026-07', geography: 'A', marca: 'FOTON', unidades_marca: 10,
    unidades_universo: 100, share_pct: 10, ranking: 3,
  });
});
