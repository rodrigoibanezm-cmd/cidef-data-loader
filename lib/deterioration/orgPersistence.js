function adverse(row, method) {
  if (method === 'relative') return row.deviations.relative != null && row.deviations.relative < 0;
  if (method === 'scaled_mad') return row.deviations.scaled_mad != null && row.deviations.scaled_mad < 0;
  if (method === 'historical_percentile') {
    const value = row.deviations.historical_percentile;
    return value != null && value < 0.5;
  }
  return false;
}

function tail(rows, size) {
  return rows.length >= size ? rows.slice(-size) : null;
}

export function evaluatePersistence(rule, rows, method) {
  if (rule.startsWith('consecutive_')) {
    const size = Number(rule.split('_').at(-1));
    const window = tail(rows, size);
    if (!window || !window.every((row) => adverse(row, method))) return null;
    return { onset_month: window[0].month, evidence_months: window.map((row) => row.month) };
  }
  if (rule === 'frequency_2_of_3' || rule === 'frequency_3_of_4') {
    const [need, size] = rule === 'frequency_2_of_3' ? [2, 3] : [3, 4];
    const window = tail(rows, size);
    if (!window) return null;
    const hits = window.filter((row) => adverse(row, method));
    if (hits.length < need || !adverse(window.at(-1), method)) return null;
    return { onset_month: hits[0].month, evidence_months: hits.map((row) => row.month) };
  }
  if (rule === 'deepening_2') {
    const window = tail(rows, 2);
    if (!window || !window.every((row) => adverse(row, method))) return null;
    if (!(window[1].deviations.error < window[0].deviations.error)) return null;
    return { onset_month: window[0].month, evidence_months: window.map((row) => row.month) };
  }
  throw new Error(`Unknown persistence rule: ${rule}`);
}

export function isAdverse(row, method) {
  return adverse(row, method);
}
