import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleMonthlyRows } from '../lib/competitive-trajectory/assembleMonthlyRows.js';
import { parseTrajectoryOutputInput } from '../lib/competitive-trajectory/trajectoryOutputInput.js';
import { projectTrajectoryOutput } from '../lib/competitive-trajectory/projectTrajectoryOutput.js';
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

function fixture() {
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
  return { monthly, trajectory: summarizeTrajectory(monthly.rows) };
}

test('monthly peer rows filter origin, zero-fill and rerank inside peer universe', () => {
  const { monthly, trajectory } = fixture();
  assert.equal(monthly.rows.length, 6);
  assert.ok(monthly.rows.every((item) => item.marketOrigin.originGroup === 'CHINESE'));
  const febMage = monthly.rows.find((item) => item.month === '2026-02' && item.modelId === 481);
  assert.deepEqual([febMage.units, febMage.share, febMage.rank], [0, 0, null]);
  const janMage = monthly.rows.find((item) => item.month === '2026-01' && item.modelId === 481);
  assert.equal(janMage.rank, 1);
  assert.equal(janMage.share, 2 / 3);
  const mage = trajectory.find((item) => item.modelId === 481);
  assert.equal(mage.firstShare, 2 / 3);
  assert.equal(mage.lastShare, 0.75);
  assert.equal(mage.shareChangePp, 8.333333);
  assert.equal(mage.monthsWithUnits, 2);
});

test('trajectory is compact default and omits monthly rows', () => {
  const { monthly, trajectory } = fixture();
  const request = parseTrajectoryOutputInput({});
  const projected = projectTrajectoryOutput({
    context: 'competitive_share_trajectory_v01', version: '0.2', scope, targets: [], peerUniverses: [],
    monthly: monthly.rows, trajectory, validation: { ok: true }, warnings: [],
  }, request);
  assert.equal(projected.output.mode, 'trajectory');
  assert.equal('monthly' in projected, false);
  assert.equal(projected.trajectory.length, 2);
});

test('monthly output requires and filters explicit entity_keys', () => {
  assert.throws(() => parseTrajectoryOutputInput({ output_mode: 'monthly' }), /entity_keys is required/);
  const { monthly, trajectory } = fixture();
  const request = parseTrajectoryOutputInput({ output_mode: 'monthly', entity_keys: ['MODEL:481'] });
  const projected = projectTrajectoryOutput({
    context: 'competitive_share_trajectory_v01', version: '0.2', scope, targets: [], peerUniverses: [],
    monthly: monthly.rows, trajectory, validation: { ok: true }, warnings: [],
  }, request);
  assert.equal('trajectory' in projected, false);
  assert.equal(projected.monthly.length, 3);
  assert.ok(projected.monthly.every((item) => item.entityKey === 'MODEL:481'));
  assert.equal(projected.validation.entity_keys_complete, true);
});

test('trajectory query reuses identity CTEs and fixes universe over full range', () => {
  const query = buildTrajectoryQuery(scope);
  assert.match(query.sql, /identity_resolution/);
  assert.match(query.sql, /target_universe_keys/);
  assert.match(query.sql, /date_trunc\('month',i\.fecha\)/);
  assert.deepEqual(query.params, [[481], '2026-01-01', '2026-03-31']);
});
