import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleMonthlyRows } from '../lib/competitive-trajectory/assembleMonthlyRows.js';
import { summarizeTrajectory } from '../lib/competitive-trajectory/summarizeTrajectory.js';
import { buildTrajectoryQuery } from '../lib/competitive-trajectory/trajectoryQuery.js';

function row(month, brand, model, id, units) {
  return {
    month,
    segment_key: 'SUV', type_key: 'SUV', fuel_key: 'GASOLINA',
    segment: 'SUV', type: 'SUV', fuel: 'GASOLINA', target_model_ids: [481],
    entity_key: `MODEL:${id}`, model_id: id, identity_status: 'RESUELTO',
    brand, model, rvm_brand: brand, rvm_model: model, units, row_count: units,
  };
}

const scope = {
  targetModelIds: [481], dateFrom: '2026-01-01', dateTo: '2026-03-31',
  geography: null, originGroup: 'CHINESE',
};

test('monthly peer rows filter origin, zero-fill and rerank inside peer universe', () => {
  const raw = [
    row('2026-01', 'DONGFENG', 'MAGE', 481, 10),
    row('2026-01', 'MG', 'HS', 20, 5),
    row('2026-01', 'TOYOTA', 'RAV4', 10, 20),
    row('2026-02', 'MG', 'HS', 20, 5),
    row('2026-02', 'TOYOTA', 'RAV4', 10, 20),
    row('2026-03', 'DONGFENG', 'MAGE', 481, 15),
    row('2026-03', 'MG', 'HS', 20, 5),
  ];
  const monthly = assembleMonthlyRows(scope, raw);
  assert.equal(monthly.rows.length, 6);
  assert.ok(monthly.rows.every((item) => item.marketOrigin.originGroup === 'CHINESE'));

  const febMage = monthly.rows.find((item) => item.month === '2026-02' && item.modelId === 481);
  assert.equal(febMage.units, 0);
  assert.equal(febMage.share, 0);
  assert.equal(febMage.rank, null);

  const janMage = monthly.rows.find((item) => item.month === '2026-01' && item.modelId === 481);
  assert.equal(janMage.rank, 1);
  assert.equal(janMage.share, 2 / 3);

  const trajectory = summarizeTrajectory(monthly.rows);
  const mage = trajectory.find((item) => item.modelId === 481);
  assert.equal(mage.firstShare, 2 / 3);
  assert.equal(mage.lastShare, 0.75);
  assert.equal(mage.shareChangePp, 8.333333);
  assert.equal(mage.monthsWithUnits, 2);
});

test('trajectory query reuses identity CTEs and fixes universe over full range', () => {
  const query = buildTrajectoryQuery(scope);
  assert.match(query.sql, /identity_resolution/);
  assert.match(query.sql, /target_universe_keys/);
  assert.match(query.sql, /date_trunc\('month',i\.fecha\)/);
  assert.deepEqual(query.params, [[481], '2026-01-01', '2026-03-31']);
});
