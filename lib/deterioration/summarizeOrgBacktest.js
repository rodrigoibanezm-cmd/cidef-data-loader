function rate(values) {
  const known = values.filter((value) => value != null);
  return known.length ? known.filter(Boolean).length / known.length : null;
}

export function summarizeYearStability(episodes) {
  const groups = new Map();
  for (const row of episodes) {
    const year = row.confirmation_month.slice(0, 4);
    const key = `${year}|${row.baseline}|${row.deviation_method}|${row.persistence_rule}`;
    if (!groups.has(key)) groups.set(key, { year, baseline: row.baseline,
      deviation_method: row.deviation_method, persistence_rule: row.persistence_rule, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map((group) => ({
    year: group.year,
    baseline: group.baseline,
    deviation_method: group.deviation_method,
    persistence_rule: group.persistence_rule,
    episodes: group.rows.length,
    immediate_reversal_rate: rate(group.rows.map((row) => row.next_reverted)),
    next_2_persistent_rate: rate(group.rows.map((row) => row.next_2_all_negative)),
    next_3_persistent_rate: rate(group.rows.map((row) => row.next_3_all_negative)),
  })).sort((a, b) => a.year.localeCompare(b.year));
}

export function evaluableByBaseline(rows, baselines) {
  return Object.fromEntries(baselines.map((name) => [
    name,
    rows.filter((row) => row.baseline === name).length,
  ]));
}
