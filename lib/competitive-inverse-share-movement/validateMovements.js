import { adjacentMonths, MOVEMENT } from './buildPairMovement.js';

const EPSILON = 1e-9;
const ALLOWED_SUMMARIES = new Set([
  MOVEMENT.TARGET_GAIN_PEER_LOSS,
  MOVEMENT.TARGET_LOSS_PEER_GAIN,
  'BIDIRECTIONAL',
  'NO_CLEAR_PATTERN',
]);

function close(left, right) {
  return Math.abs(left - right) < EPSILON;
}

function detailDeltaReconciles(row) {
  if (!row.evaluable) {
    return row.target.deltaSharePp == null && row.peer.deltaSharePp == null && row.movement == null;
  }
  return close(row.target.deltaSharePp, 100 * (row.target.toShare - row.target.fromShare))
    && close(row.peer.deltaSharePp, 100 * (row.peer.toShare - row.peer.fromShare));
}

function countsReconcile(row) {
  return row.jointEvaluableTransitions === row.targetGainPeerLoss.occurrences
    + row.targetLossPeerGain.occurrences
    + row.sameDirectionOccurrences
    + row.flatOrOneSidedOccurrences;
}

function aggregateReconciles(row, movement, summary) {
  const detail = row.transitionDetail.filter((item) => item.movement === movement);
  const targetTotal = detail.reduce((sum, item) => sum + item.target.deltaSharePp, 0);
  const peerTotal = detail.reduce((sum, item) => sum + item.peer.deltaSharePp, 0);
  return detail.length === summary.occurrences
    && close(targetTotal, summary.targetShareChangePp.total)
    && close(peerTotal, summary.peerShareChangePp.total);
}

function sameGeography(expected, actual) {
  return JSON.stringify(expected || null) === JSON.stringify(actual || null);
}

export function validateInverseShareMovements({ context, parsed, selectedSummaries, rows }) {
  const byPair = new Map(selectedSummaries.map((summary) => [summary.pairKey, summary]));
  const fromMonth = parsed.scope.dateFrom.slice(0, 7);
  const toMonth = parsed.scope.dateTo.slice(0, 7);
  const validation = {
    source_signal_backtest_ok: context.validation.ok,
    source_monthly_share_reconciles: context.validation.monthly_share_reconciles,
    relation_count_reconciles: rows.length === selectedSummaries.length,
    selected_pair_keys_unique: new Set(rows.map((row) => row.pairKey)).size === rows.length,
    no_out_of_period_evidence: rows.every((row) => row.transitionDetail.every((detail) => (
      detail.fromMonth >= fromMonth && detail.toMonth <= toMonth
    ))),
    no_invalid_temporal_crossing: rows.every((row) => row.transitionDetail.every((detail) => (
      !detail.evaluable || (adjacentMonths(detail.fromMonth, detail.toMonth)
        && detail.target.fromObserved && detail.target.toObserved
        && detail.peer.fromObserved && detail.peer.toObserved)
    ))),
    no_self_pair: rows.every((row) => `MODEL:${row.targetModelId}` !== row.peer.entityKey),
    peer_universe_preserved: rows.every((row) => (
      row.peerUniverse.key === byPair.get(row.pairKey)?.universe?.universeKey
    )),
    origin_group_preserved: rows.every((row) => row.peerUniverse.originGroup === parsed.scope.originGroup),
    geography_preserved: sameGeography(parsed.scope.geography && {
      level: parsed.scope.geography.level,
      values: parsed.scope.geography.values,
    }, context.scope.geography),
    share_delta_reconciles: rows.every((row) => row.transitionDetail.every(detailDeltaReconciles)),
    transition_counts_reconcile: rows.every(countsReconcile),
    detail_reconciles_with_summary: rows.every((row) => (
      aggregateReconciles(row, MOVEMENT.TARGET_GAIN_PEER_LOSS, row.targetGainPeerLoss)
      && aggregateReconciles(row, MOVEMENT.TARGET_LOSS_PEER_GAIN, row.targetLossPeerGain)
    )),
    no_causal_claims_encoded: rows.every((row) => ALLOWED_SUMMARIES.has(row.relationshipSummary)
      && row.transitionDetail.every((detail) => detail.movement == null
        || Object.values(MOVEMENT).includes(detail.movement))),
  };
  validation.ok = Object.values(validation).every((value) => value === true);
  return validation;
}
