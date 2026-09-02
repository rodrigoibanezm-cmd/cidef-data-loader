import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBacktestOutputInput } from '../lib/competitive-signal-backtest/backtestInput.js';
import { buildPairSeries } from '../lib/competitive-signal-backtest/pairSeries.js';
import { pairDetail, summarizePair } from '../lib/competitive-signal-backtest/pairFeatures.js';
import { projectBacktestOutput } from '../lib/competitive-signal-backtest/projectBacktestOutput.js';

function row(month, id, brand, model, share, rank, observed = true) {
  return {
    month,
    universeKey: 'SUV|SUV|GASOLINA',
    universe: { segment: 'SUV', type: 'SUV', fuel: 'GASOLINA' },
    targetModelIds: [481],
    entityKey: `MODEL:${id}`,
    modelId: id,
    identityStatus: 'RESUELTO',
    brand,
    model,
    units: observed ? 10 : 0,
    share,
    rank: observed ? rank : null,
    observed,
  };
}

const monthly = [
  row('2026-01', 481, 'DONGFENG', 'MAGE', 0.20, 1),
  row('2026-01', 107, 'KAIYI', 'KYX3', 0.10, 2),
  row('2026-01', 565, 'CHANGAN', 'CS35 MAX', 0, null, false),
  row('2026-02', 481, 'DONGFENG', 'MAGE', 0.10, 2),
  row('2026-02', 107, 'KAIYI', 'KYX3', 0.20, 1),
  row('2026-02', 565, 'CHANGAN', 'CS35 MAX', 0, null, false),
  row('2026-03', 481, 'DONGFENG', 'MAGE', 0.15, 1),
  row('2026-03', 107, 'KAIYI', 'KYX3', 0.15, 1),
  row('2026-03', 565, 'CHANGAN', 'CS35 MAX', 0.14, 2, true),
  row('2026-04', 481, 'DONGFENG', 'MAGE', 0.20, 1),
  row('2026-04', 107, 'KAIYI', 'KYX3', 0.10, 2),
  row('2026-04', 565, 'CHANGAN', 'CS35 MAX', 0.19, 2, true),
];

const context = { monthly, validation: { months_returned: 4 } };

test('pair generator emits every peer and excludes self', () => {
  const set = buildPairSeries(context, 'CHINESE');
  assert.equal(set.pairs.length, 2);
  assert.equal(set.expectedPairCount, 2);
  assert.ok(set.pairs.every((pair) => pair.target.entityKey !== pair.peer.entityKey));
  assert.ok(set.pairs.every((pair) => pair.universe.originGroup === 'CHINESE'));
});

test('features separate continuity from proximity and preserve ties', () => {
  const pair = buildPairSeries(context, 'CHINESE').pairs.find((item) => item.peer.modelId === 107);
  const summary = summarizePair(pair);
  const detail = pairDetail(pair);
  assert.equal(summary.continuity.jointActiveMonths, 4);
  assert.equal(summary.crossings.count, 2);
  assert.deepEqual(detail.crossingEvents[1].tieMonths, ['2026-03']);
  assert.equal(summary.diagnostics.rankGap.evaluableMonths, 4);
  assert.equal(summary.shareGap.minPp, 0);
});

test('late entrant remains a pair but has low joint continuity', () => {
  const pair = buildPairSeries(context, 'CHINESE').pairs.find((item) => item.peer.modelId === 565);
  const summary = summarizePair(pair);
  assert.equal(summary.continuity.peerActiveMonths, 2);
  assert.equal(summary.continuity.jointActiveMonths, 2);
  assert.equal(summary.continuity.peerZeroMonths, 2);
});

test('summary pagination is bounded and deterministic', () => {
  const summaries = buildPairSeries(context, 'CHINESE').pairs.map(summarizePair);
  const base = {
    context: 'competitive_signal_backtest_v01', version: '0.2', scope: {},
    targets: [], universes: [], coverage: { pairs: summaries.length },
    summaries, detailByKey: new Map(), validation: { ok: true }, warnings: [],
  };
  const first = projectBacktestOutput({ ...base,
    output: parseBacktestOutputInput({ output_mode: 'summary', pair_limit: 1, pair_offset: 0 }) });
  const second = projectBacktestOutput({ ...base,
    output: parseBacktestOutputInput({ output_mode: 'summary', pair_limit: 1, pair_offset: 1 }) });
  assert.equal(first.pairs.length, 1);
  assert.equal(first.page.totalPairs, 2);
  assert.equal(first.page.hasMore, true);
  assert.equal(first.page.nextOffset, 1);
  assert.notEqual(first.pairs[0].pairKey, second.pairs[0].pairKey);
  assert.equal(first.pairs[0].targetModelId, 481);
  assert.equal(first.pairs[0].universeKey.includes('CHINESE'), true);
  assert.equal('target' in first.pairs[0], false);
  assert.equal('universe' in first.pairs[0], false);
});

test('summary defaults to bounded transport', () => {
  assert.deepEqual(parseBacktestOutputInput({}), {
    outputMode: 'summary', pairKeys: [], pairOffset: 0, pairLimit: 20,
  });
  assert.throws(() => parseBacktestOutputInput({ pair_limit: 51 }), /pair_limit/);
  assert.throws(() => parseBacktestOutputInput({ pair_offset: -1 }), /pair_offset/);
  assert.throws(() => parseBacktestOutputInput({ pair_keys: ['x'] }), /only valid when output_mode=pair_detail/);
});

test('pair_detail requires explicit pair keys and rejects summary pagination', () => {
  assert.throws(() => parseBacktestOutputInput({ output_mode: 'pair_detail' }), /pair_keys is required/);
  assert.throws(() => parseBacktestOutputInput({ output_mode: 'pair_detail', pair_keys: ['x'], pair_limit: 1 }), /only valid when output_mode=summary/);
});
