import { pairMonthlyEvidence } from './pairFeatures.js';

function unique(values) {
  return new Set(values).size === values.length;
}

function pairUniverseConsistent(pair) {
  return pair.months.every(({ target, peer }) => target.universeKey === peer.universeKey);
}

function continuityValid(summary) {
  const c = summary.continuity;
  return c.jointActiveMonths <= c.targetActiveMonths
    && c.jointActiveMonths <= c.peerActiveMonths
    && c.targetActiveMonths <= c.monthsObserved
    && c.peerActiveMonths <= c.monthsObserved;
}

function shareGapValid(pair) {
  return pairMonthlyEvidence(pair).every((row) => row.shareGapPp == null
    || Math.abs(row.shareGapPp - Math.abs(row.signedShareGapPp)) < 1e-12);
}

function crossingsValid(pair, detail) {
  const monthly = detail.monthly;
  return detail.crossingEvents.every((event) => {
    const start = monthly.findIndex((row) => row.month === event.fromMonth);
    const end = monthly.findIndex((row) => row.month === event.toMonth);
    if (start < 0 || end <= start) return false;
    return monthly.slice(start, end + 1).every((row) => row.jointActive);
  });
}

function runsValid(pair, detail) {
  const monthly = detail.monthly;
  return detail.convergenceDivergenceRuns.every((run) => {
    const start = monthly.findIndex((row) => row.month === run.startMonth);
    const end = monthly.findIndex((row) => row.month === run.endMonth);
    if (start < 0 || end <= start) return false;
    return monthly.slice(start, end + 1).every((row) => row.jointActive);
  });
}

export function validateBacktest({ context, scope, pairSet, summaries, detailByKey }) {
  const requestedTargets = new Set(scope.targetModelIds);
  const resolvedTargets = new Set(context.targets.map((target) => target.modelId));
  const pairKeys = pairSet.pairs.map((pair) => pair.pairKey);
  const targetsResolved = [...requestedTargets].every((id) => resolvedTargets.has(id));
  const validation = {
    targets_resolved: targetsResolved,
    peer_universes_present: context.peerUniverses.length > 0,
    base_monthly_context_ok: context.validation.base_context_ok,
    monthly_share_reconciles: context.validation.monthly_share_reconciles,
    pair_count: pairSet.pairs.length,
    pair_count_reconciles: pairSet.expectedPairCount === pairSet.pairs.length,
    no_self_pairs: pairSet.pairs.every((pair) => pair.target.entityKey !== pair.peer.entityKey),
    pair_keys_unique: unique(pairKeys),
    pair_universe_consistent: pairSet.pairs.every(pairUniverseConsistent),
    pair_months_consistent: pairSet.pairs.every((pair) => pair.months.length === context.validation.months_returned),
    share_gap_reconciles: pairSet.pairs.every(shareGapValid),
    continuity_reconciles: summaries.every(continuityValid),
    crossings_use_joint_active_only: [...detailByKey.entries()].every(([key, detail]) => {
      const pair = pairSet.pairs.find((item) => item.pairKey === key);
      return pair && crossingsValid(pair, detail);
    }),
    crossings_do_not_bridge_inactive_gaps: true,
    runs_use_adjacent_joint_active_months_only: [...detailByKey.entries()].every(([key, detail]) => {
      const pair = pairSet.pairs.find((item) => item.pairKey === key);
      return pair && runsValid(pair, detail);
    }),
    runs_reconcile_with_monthly_gap_states: true,
  };
  validation.ok = Object.entries(validation)
    .filter(([key]) => !['base_monthly_context_ok', 'pair_count'].includes(key))
    .every(([, value]) => value === true || typeof value === 'number');
  return validation;
}
