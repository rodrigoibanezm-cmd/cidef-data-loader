import { activeSpans } from './activeSpans.js';
import { summarizeCrossings } from './crossings.js';
import { summarizeGapRuns } from './gapRuns.js';
import { summarizeNumbers } from './numericStats.js';

function compactEntity(row) {
  return {
    observed: Boolean(row.observed),
    units: Number(row.units ?? 0),
    share: row.share == null ? null : Number(row.share),
    rank: row.rank == null ? null : Number(row.rank),
  };
}

export function pairMonthlyEvidence(pair) {
  return pair.months.map(({ target, peer }) => {
    const targetCompact = compactEntity(target);
    const peerCompact = compactEntity(peer);
    const sharesValid = targetCompact.share != null && peerCompact.share != null;
    const signedShareGapPp = sharesValid
      ? 100 * (targetCompact.share - peerCompact.share)
      : null;
    return {
      month: target.month,
      target: targetCompact,
      peer: peerCompact,
      signedShareGapPp,
      shareGapPp: signedShareGapPp == null ? null : Math.abs(signedShareGapPp),
      jointActive: targetCompact.observed && peerCompact.observed,
    };
  });
}

function continuity(monthly) {
  const targetActive = monthly.filter((row) => row.target.observed).length;
  const peerActive = monthly.filter((row) => row.peer.observed).length;
  const joint = monthly.filter((row) => row.jointActive);
  return {
    monthsObserved: monthly.length,
    targetActiveMonths: targetActive,
    peerActiveMonths: peerActive,
    jointActiveMonths: joint.length,
    targetZeroMonths: monthly.length - targetActive,
    peerZeroMonths: monthly.length - peerActive,
    firstJointActiveMonth: joint[0]?.month ?? null,
    lastJointActiveMonth: joint.at(-1)?.month ?? null,
  };
}

function rankDiagnostic(monthly) {
  const gaps = monthly
    .filter((row) => row.target.rank != null && row.peer.rank != null)
    .map((row) => Math.abs(row.target.rank - row.peer.rank));
  const stats = summarizeNumbers(gaps);
  return {
    evaluableMonths: stats.months,
    mean: stats.mean,
    median: stats.median,
    min: stats.min,
    max: stats.max,
  };
}

export function summarizePair(pair) {
  const monthly = pairMonthlyEvidence(pair);
  const shareGap = summarizeNumbers(monthly.map((row) => row.shareGapPp));
  const crossings = summarizeCrossings(monthly);
  const gapRuns = summarizeGapRuns(monthly);
  return {
    pairKey: pair.pairKey,
    target: pair.target,
    peer: pair.peer,
    universe: { universeKey: pair.universeKey, ...pair.universe },
    continuity: continuity(monthly),
    shareGap: {
      months: shareGap.months,
      meanPp: shareGap.mean,
      medianPp: shareGap.median,
      stddevPopulationPp: shareGap.stddevPopulation,
      minPp: shareGap.min,
      maxPp: shareGap.max,
    },
    crossings: {
      count: crossings.count,
      firstCrossingMonth: crossings.firstCrossingMonth,
      lastCrossingMonth: crossings.lastCrossingMonth,
    },
    convergenceDivergence: {
      convergenceRunCount: gapRuns.convergenceRunCount,
      divergenceRunCount: gapRuns.divergenceRunCount,
      longestConvergenceRunTransitions: gapRuns.longestConvergenceRunTransitions,
      longestDivergenceRunTransitions: gapRuns.longestDivergenceRunTransitions,
    },
    diagnostics: { rankGap: rankDiagnostic(monthly) },
  };
}

export function pairDetail(pair) {
  const monthly = pairMonthlyEvidence(pair);
  return {
    monthly,
    crossingEvents: summarizeCrossings(monthly).events,
    convergenceDivergenceRuns: summarizeGapRuns(monthly).runs,
    activeSpans: activeSpans(monthly),
  };
}
