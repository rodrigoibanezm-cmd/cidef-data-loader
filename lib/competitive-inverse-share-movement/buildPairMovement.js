import { pairMonthlyEvidence } from '../competitive-signal-backtest/pairFeatures.js';

export const MOVEMENT = Object.freeze({
  TARGET_GAIN_PEER_LOSS: 'TARGET_GAIN_PEER_LOSS',
  TARGET_LOSS_PEER_GAIN: 'TARGET_LOSS_PEER_GAIN',
  SAME_DIRECTION: 'SAME_DIRECTION',
  FLAT_OR_ONE_SIDED: 'FLAT_OR_ONE_SIDED',
});

function nextMonth(month) {
  const [year, value] = String(month).split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(value)) return null;
  const date = new Date(Date.UTC(year, value, 1));
  return date.toISOString().slice(0, 7);
}

export function adjacentMonths(fromMonth, toMonth) {
  return nextMonth(fromMonth) === toMonth;
}

function finiteShares(row) {
  return Number.isFinite(row.target.share) && Number.isFinite(row.peer.share);
}

function classify(targetDeltaSharePp, peerDeltaSharePp) {
  if (targetDeltaSharePp > 0 && peerDeltaSharePp < 0) return MOVEMENT.TARGET_GAIN_PEER_LOSS;
  if (targetDeltaSharePp < 0 && peerDeltaSharePp > 0) return MOVEMENT.TARGET_LOSS_PEER_GAIN;
  if ((targetDeltaSharePp > 0 && peerDeltaSharePp > 0)
    || (targetDeltaSharePp < 0 && peerDeltaSharePp < 0)) return MOVEMENT.SAME_DIRECTION;
  return MOVEMENT.FLAT_OR_ONE_SIDED;
}

function transition(previous, current) {
  const consecutive = adjacentMonths(previous.month, current.month);
  const jointActiveAtBothEndpoints = previous.jointActive && current.jointActive;
  const sharesAvailableAtBothEndpoints = finiteShares(previous) && finiteShares(current);
  const evaluable = consecutive && jointActiveAtBothEndpoints && sharesAvailableAtBothEndpoints;
  let exclusionReason = null;
  if (!consecutive) exclusionReason = 'NON_CONSECUTIVE_MONTHS';
  else if (!jointActiveAtBothEndpoints) exclusionReason = 'INACTIVE_ENDPOINT';
  else if (!sharesAvailableAtBothEndpoints) exclusionReason = 'MISSING_SHARE';

  const targetDeltaSharePp = evaluable
    ? 100 * (current.target.share - previous.target.share)
    : null;
  const peerDeltaSharePp = evaluable
    ? 100 * (current.peer.share - previous.peer.share)
    : null;

  return {
    fromMonth: previous.month,
    toMonth: current.month,
    evaluable,
    exclusionReason,
    target: {
      fromObserved: previous.target.observed,
      toObserved: current.target.observed,
      fromShare: previous.target.share,
      toShare: current.target.share,
      deltaSharePp: targetDeltaSharePp,
    },
    peer: {
      fromObserved: previous.peer.observed,
      toObserved: current.peer.observed,
      fromShare: previous.peer.share,
      toShare: current.peer.share,
      deltaSharePp: peerDeltaSharePp,
    },
    movement: evaluable ? classify(targetDeltaSharePp, peerDeltaSharePp) : null,
  };
}

function aggregate(rows) {
  const targetTotal = rows.reduce((sum, row) => sum + row.target.deltaSharePp, 0);
  const peerTotal = rows.reduce((sum, row) => sum + row.peer.deltaSharePp, 0);
  return {
    occurrences: rows.length,
    targetShareChangePp: {
      total: targetTotal,
      mean: rows.length ? targetTotal / rows.length : null,
    },
    peerShareChangePp: {
      total: peerTotal,
      mean: rows.length ? peerTotal / rows.length : null,
    },
  };
}

function relationshipSummary(targetGainPeerLoss, targetLossPeerGain) {
  if (targetGainPeerLoss > 0 && targetLossPeerGain > 0) return 'BIDIRECTIONAL';
  if (targetGainPeerLoss > 0) return MOVEMENT.TARGET_GAIN_PEER_LOSS;
  if (targetLossPeerGain > 0) return MOVEMENT.TARGET_LOSS_PEER_GAIN;
  return 'NO_CLEAR_PATTERN';
}

export function buildPairInverseShareMovement(pair, relationSummary, scope) {
  const monthly = pairMonthlyEvidence(pair);
  const transitionDetail = monthly.slice(1).map((row, index) => transition(monthly[index], row));
  const evaluable = transitionDetail.filter((row) => row.evaluable);
  const gainLoss = evaluable.filter((row) => row.movement === MOVEMENT.TARGET_GAIN_PEER_LOSS);
  const lossGain = evaluable.filter((row) => row.movement === MOVEMENT.TARGET_LOSS_PEER_GAIN);
  const sameDirection = evaluable.filter((row) => row.movement === MOVEMENT.SAME_DIRECTION);
  const flatOrOneSided = evaluable.filter((row) => row.movement === MOVEMENT.FLAT_OR_ONE_SIDED);
  const inverseOccurrences = gainLoss.length + lossGain.length;

  return {
    pairKey: pair.pairKey,
    targetModelId: pair.target.modelId,
    peer: pair.peer,
    peerUniverse: {
      key: relationSummary.universe.universeKey,
      segment: relationSummary.universe.segment,
      type: relationSummary.universe.type,
      fuel: relationSummary.universe.fuel,
      originGroup: relationSummary.universe.originGroup,
    },
    period: { dateFrom: scope.dateFrom, dateTo: scope.dateTo },
    relationEvidence: {
      medianShareGapPp: relationSummary.shareGap.medianPp,
      jointActiveMonths: relationSummary.continuity.jointActiveMonths,
      crossings: relationSummary.crossings.count,
    },
    candidateTransitions: transitionDetail.length,
    jointEvaluableTransitions: evaluable.length,
    targetGainMonths: evaluable.filter((row) => row.target.deltaSharePp > 0).map((row) => row.toMonth),
    targetLossMonths: evaluable.filter((row) => row.target.deltaSharePp < 0).map((row) => row.toMonth),
    targetGainPeerLoss: aggregate(gainLoss),
    targetLossPeerGain: aggregate(lossGain),
    sameDirectionOccurrences: sameDirection.length,
    flatOrOneSidedOccurrences: flatOrOneSided.length,
    inverseDirectionOccurrences: inverseOccurrences,
    inverseDirectionRate: evaluable.length ? inverseOccurrences / evaluable.length : null,
    relationshipSummary: relationshipSummary(gainLoss.length, lossGain.length),
    transitionDetail,
  };
}
