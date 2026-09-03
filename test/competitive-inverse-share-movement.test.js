import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPairInverseShareMovement, MOVEMENT } from '../lib/competitive-inverse-share-movement/buildPairMovement.js';
import { parseInverseShareMovementInput } from '../lib/competitive-inverse-share-movement/movementInput.js';
import { projectInverseShareMovements } from '../lib/competitive-inverse-share-movement/projectMovements.js';
import { validateInverseShareMovements } from '../lib/competitive-inverse-share-movement/validateMovements.js';

function entity(month, entityKey, modelId, share, observed = true) {
  return {
    month,
    universeKey: 'SUV|SUV|GASOLINA',
    entityKey,
    modelId,
    identityStatus: 'RESUELTO',
    brand: modelId === 481 ? 'DONGFENG' : 'PEER',
    model: String(modelId),
    units: observed ? 10 : 0,
    share,
    rank: observed ? 1 : null,
    observed,
  };
}

function pairRow(month, targetShare, peerShare, targetObserved = true, peerObserved = true) {
  return {
    target: entity(month, 'MODEL:481', 481, targetShare, targetObserved),
    peer: entity(month, 'MODEL:107', 107, peerShare, peerObserved),
  };
}

const pair = {
  pairKey: '481|MODEL:107|SUV|SUV|GASOLINA|CHINESE',
  target: { entityKey: 'MODEL:481', modelId: 481 },
  peer: { entityKey: 'MODEL:107', modelId: 107, identityStatus: 'RESUELTO', brand: 'PEER', model: '107' },
  universeKey: 'SUV|SUV|GASOLINA|CHINESE',
  universe: { segment: 'SUV', type: 'SUV', fuel: 'GASOLINA', originGroup: 'CHINESE' },
  months: [
    pairRow('2026-01', 0.20, 0.20),
    pairRow('2026-02', 0.25, 0.15),
    pairRow('2026-03', 0.20, 0.22),
    pairRow('2026-04', 0.23, 0.25),
    pairRow('2026-05', 0, 0.30, false, true),
    pairRow('2026-06', 0.28, 0.24),
    pairRow('2026-07', 0.30, 0.20),
  ],
};

const relationSummary = {
  pairKey: pair.pairKey,
  target: pair.target,
  peer: pair.peer,
  universe: { universeKey: pair.universeKey, ...pair.universe },
  continuity: { jointActiveMonths: 6 },
  shareGap: { medianPp: 2 },
  crossings: { count: 2 },
};

const scope = {
  targetModelIds: [481],
  dateFrom: '2026-01-01',
  dateTo: '2026-07-31',
  originGroup: 'CHINESE',
  geography: { level: 'region', column: 'region', values: ['METROPOLITANA'] },
};

test('inverse share movement uses only adjacent joint-active endpoints', () => {
  const result = buildPairInverseShareMovement(pair, relationSummary, scope);
  assert.equal(result.candidateTransitions, 6);
  assert.equal(result.jointEvaluableTransitions, 4);
  assert.equal(result.targetGainPeerLoss.occurrences, 2);
  assert.equal(result.targetLossPeerGain.occurrences, 1);
  assert.equal(result.sameDirectionOccurrences, 1);
  assert.equal(result.relationshipSummary, 'BIDIRECTIONAL');
  assert.deepEqual(result.targetGainMonths, ['2026-02', '2026-04', '2026-07']);
  assert.deepEqual(result.targetLossMonths, ['2026-03']);
  assert.equal(result.transitionDetail[3].exclusionReason, 'INACTIVE_ENDPOINT');
  assert.equal(result.transitionDetail[4].exclusionReason, 'INACTIVE_ENDPOINT');
  assert.equal(result.transitionDetail[3].target.deltaSharePp, null);
});

test('movement magnitudes reconcile in both inverse directions', () => {
  const result = buildPairInverseShareMovement(pair, relationSummary, scope);
  assert.ok(Math.abs(result.targetGainPeerLoss.targetShareChangePp.total - 7) < 1e-9);
  assert.ok(Math.abs(result.targetGainPeerLoss.peerShareChangePp.total + 9) < 1e-9);
  assert.ok(Math.abs(result.targetLossPeerGain.targetShareChangePp.total + 5) < 1e-9);
  assert.ok(Math.abs(result.targetLossPeerGain.peerShareChangePp.total - 7) < 1e-9);
  assert.equal(result.transitionDetail[0].movement, MOVEMENT.TARGET_GAIN_PEER_LOSS);
  assert.equal(result.transitionDetail[1].movement, MOVEMENT.TARGET_LOSS_PEER_GAIN);
});

test('all requested deterministic validations pass on reconciled detail', () => {
  const row = buildPairInverseShareMovement(pair, relationSummary, scope);
  const parsed = {
    scope, pairOffset: 0, pairLimit: 20, minEvaluableTransitions: 2,
  };
  const context = {
    scope: { dateFrom: scope.dateFrom, dateTo: scope.dateTo, geography: { level: 'region', values: ['METROPOLITANA'] }, originGroup: 'CHINESE' },
    validation: { ok: true, monthly_share_reconciles: true },
  };
  const projection = projectInverseShareMovements([row], parsed);
  const validation = validateInverseShareMovements({
    context, parsed, selectedSummaries: [relationSummary], rows: [row], projection,
  });
  assert.equal(validation.ok, true);
  for (const key of [
    'no_out_of_period_evidence', 'no_invalid_temporal_crossing', 'no_self_pair',
    'peer_universe_preserved', 'origin_group_preserved', 'geography_preserved',
    'share_delta_reconciles', 'transition_counts_reconcile',
    'detail_reconciles_with_summary', 'evidence_filter_reconciles',
    'pagination_after_evidence_filter', 'no_causal_claims_encoded',
  ]) assert.equal(validation[key], true, key);
});

test('without minimum the existing universe remains and 1/1 can rank first', () => {
  const base = buildPairInverseShareMovement(pair, relationSummary, scope);
  const rows = [
    { ...base, pairKey: 'B', inverseDirectionRate: 0.75, inverseDirectionOccurrences: 3, jointEvaluableTransitions: 4 },
    { ...base, pairKey: 'A', inverseDirectionRate: 1, inverseDirectionOccurrences: 1, jointEvaluableTransitions: 1 },
  ];
  const projected = projectInverseShareMovements(rows, {
    pairOffset: 0, pairLimit: 2, minEvaluableTransitions: null,
  });
  assert.equal(projected.movements[0].pairKey, 'A');
  assert.equal(projected.page.totalRelations, 2);
  assert.equal(projected.page.eligibleRelations, 2);
  assert.equal(projected.page.excludedByMinEvidence, 0);
  assert.equal(projected.page.returnedRelations, 2);
  assert.equal(projected.page.minEvaluableTransitions, null);
});

test('minimum excludes only under-evidenced relations before ranking and pagination', () => {
  const base = buildPairInverseShareMovement(pair, relationSummary, scope);
  const rows = [
    { ...base, pairKey: 'LOW', inverseDirectionRate: 1, inverseDirectionOccurrences: 1, jointEvaluableTransitions: 1 },
    { ...base, pairKey: 'RATE_FIRST', inverseDirectionRate: 0.8, inverseDirectionOccurrences: 4, jointEvaluableTransitions: 5 },
    { ...base, pairKey: 'VOLUME_SECOND', inverseDirectionRate: 0.75, inverseDirectionOccurrences: 75, jointEvaluableTransitions: 100 },
  ];
  const projected = projectInverseShareMovements(rows, {
    pairOffset: 0, pairLimit: 1, minEvaluableTransitions: 2,
  });
  assert.equal(projected.movements[0].pairKey, 'RATE_FIRST');
  assert.equal(projected.page.totalRelations, 3);
  assert.equal(projected.page.eligibleRelations, 2);
  assert.equal(projected.page.excludedByMinEvidence, 1);
  assert.equal(projected.page.returnedRelations, 1);
  assert.equal(projected.page.minEvaluableTransitions, 2);
  assert.equal(projected.page.hasMore, true);
  assert.equal(projected.page.nextOffset, 1);
});

test('input inherits relation dates and parses only an optional positive evidence minimum', () => {
  const base = { target_model_ids: [481], date_from: '2026-01-01', date_to: '2026-07-31' };
  assert.throws(
    () => parseInverseShareMovementInput(base),
    /competitive_inverse_share_movement_v01/,
  );
  const parsed = parseInverseShareMovementInput({
    ...base, origin_group: 'CHINESE', pair_limit: 10, min_evaluable_transitions: 3,
  });
  assert.equal(parsed.pairLimit, 10);
  assert.equal(parsed.minEvaluableTransitions, 3);
  assert.equal(parsed.scope.dateFrom, '2026-01-01');
  assert.equal(parsed.scope.dateTo, '2026-07-31');
  assert.throws(() => parseInverseShareMovementInput({
    ...base, origin_group: 'CHINESE', min_evaluable_transitions: 0,
  }), /positive integer/);
});

test('date range remains fully on demand when no evidence minimum is supplied', () => {
  const parsed = parseInverseShareMovementInput({
    target_model_ids: [481],
    date_from: '2024-02-17',
    date_to: '2026-09-03',
    origin_group: 'NON_CHINESE',
  });
  assert.equal(parsed.scope.dateFrom, '2024-02-17');
  assert.equal(parsed.scope.dateTo, '2026-09-03');
  assert.equal(parsed.minEvaluableTransitions, null);
});
