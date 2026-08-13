import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../lib/motors/geographic-market-analysis.js';

function mockDb(calls) {
  return { query: async (query, params = []) => {
    calls.push({ query, params });
    if (query.includes('MAX(fecha)')) return [{ latest_month: '2026-07' }];
    if (query.includes('WITH places AS')) return [
      { geography: 'METROPOLITANA', total_geographies: 1 },
    ];
    if (query.includes("SELECT period_key,geography")) return [{
      period_key: 'current', geography: 'METROPOLITANA', marca: 'FOTON',
      brand_units: '20', universe_units: '200', share_pct: '10.0000', ranking: 3,
    }];
    return [{
      year_month: '2026-06', geography: 'METROPOLITANA', marca: 'FOTON',
      brand_units: '2', universe_units: '20', share_pct: '10.0000', ranking: 3,
    }];
  } };
}

test('motor honors historical end_month and emits its stable output contract', async () => {
  const calls = [];
  const result = await execute({
    level: 'REGION', universe: 'ALL', brand: 'FOTON', months: 6,
    comparison: 'none', end_month: '2026-06',
  }, mockDb(calls));
  assert.deepEqual(result.periodo_actual, { desde: '2026-01', hasta: '2026-06' });
  assert.equal(calls[1].params[1], '2026-07-01');
  assert.equal(result.summary[0].unidades_universo, 200);
  assert.equal(result.series[0].year_month, '2026-06');
  assert.deepEqual(result.pagination, {
    page: 1, page_size: 50, total_geographies: 1, total_pages: 1,
  });
});

test('motor rejects an end_month beyond available RVM data', async () => {
  await assert.rejects(() => execute({
    level: 'REGION', universe: 'ALL', end_month: '2026-08',
  }, mockDb([])), /exceeds latest/);
});
