function state(value) {
  if (value > 0) return 'TARGET_ABOVE';
  if (value < 0) return 'PEER_ABOVE';
  return 'TIE';
}

export function crossingEvents(monthly = []) {
  const events = [];
  let previous = null;
  let tieMonths = [];

  for (const row of monthly) {
    if (!row.jointActive || row.signedShareGapPp == null) {
      previous = null;
      tieMonths = [];
      continue;
    }
    const currentState = state(row.signedShareGapPp);
    if (currentState === 'TIE') {
      if (previous) tieMonths.push(row.month);
      continue;
    }
    if (previous && previous.state !== currentState) {
      events.push({
        fromMonth: previous.month,
        toMonth: row.month,
        fromState: previous.state,
        toState: currentState,
        tieMonths: [...tieMonths],
      });
    }
    previous = { month: row.month, state: currentState };
    tieMonths = [];
  }
  return events;
}

export function summarizeCrossings(monthly = []) {
  const events = crossingEvents(monthly);
  return {
    count: events.length,
    firstCrossingMonth: events[0]?.toMonth ?? null,
    lastCrossingMonth: events.at(-1)?.toMonth ?? null,
    events,
  };
}
