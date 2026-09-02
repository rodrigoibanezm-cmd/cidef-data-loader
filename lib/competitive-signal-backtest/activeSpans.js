function buildSpans(monthly, active) {
  const spans = [];
  let current = null;
  for (const row of monthly) {
    if (!active(row)) {
      if (current) spans.push(current);
      current = null;
      continue;
    }
    if (!current) {
      current = { startMonth: row.month, endMonth: row.month, months: 1 };
      continue;
    }
    current.endMonth = row.month;
    current.months += 1;
  }
  if (current) spans.push(current);
  return spans;
}

export function activeSpans(monthly = []) {
  return {
    target: buildSpans(monthly, (row) => row.target.observed),
    peer: buildSpans(monthly, (row) => row.peer.observed),
    joint: buildSpans(monthly, (row) => row.jointActive),
  };
}
