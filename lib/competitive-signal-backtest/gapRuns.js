function direction(previous, current) {
  if (previous == null || current == null || previous === current) return null;
  return current < previous ? 'CONVERGING' : 'DIVERGING';
}

function finish(run, runs) {
  if (!run) return null;
  runs.push({ ...run, gapChangePp: run.endGapPp - run.startGapPp });
  return null;
}

export function gapRuns(monthly = []) {
  const runs = [];
  let run = null;
  for (let index = 1; index < monthly.length; index += 1) {
    const previous = monthly[index - 1];
    const current = monthly[index];
    if (!previous.jointActive || !current.jointActive) {
      run = finish(run, runs);
      continue;
    }
    const nextDirection = direction(previous.shareGapPp, current.shareGapPp);
    if (!nextDirection) {
      run = finish(run, runs);
      continue;
    }
    if (!run || run.direction !== nextDirection) {
      run = finish(run, runs);
      run = {
        direction: nextDirection,
        startMonth: previous.month,
        endMonth: current.month,
        transitionCount: 1,
        startGapPp: previous.shareGapPp,
        endGapPp: current.shareGapPp,
      };
      continue;
    }
    run.endMonth = current.month;
    run.endGapPp = current.shareGapPp;
    run.transitionCount += 1;
  }
  finish(run, runs);
  return runs;
}

export function summarizeGapRuns(monthly = []) {
  const runs = gapRuns(monthly);
  const convergence = runs.filter((run) => run.direction === 'CONVERGING');
  const divergence = runs.filter((run) => run.direction === 'DIVERGING');
  return {
    convergenceRunCount: convergence.length,
    divergenceRunCount: divergence.length,
    longestConvergenceRunTransitions: Math.max(0, ...convergence.map((run) => run.transitionCount)),
    longestDivergenceRunTransitions: Math.max(0, ...divergence.map((run) => run.transitionCount)),
    runs,
  };
}
