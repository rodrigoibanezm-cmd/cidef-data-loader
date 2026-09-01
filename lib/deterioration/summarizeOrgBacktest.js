function rate(values) {
  const known = values.filter((value) => value != null);
  return known.length ? known.filter(Boolean).length / known.length : null;
}

export function summarizeUnits(rows) {
  const units = new Map();
  for (const row of rows) {
    const key = String(row.unit_id);
    if (!units.has(key)) {
      units.set(key, {
        unit_id: row.unit_id,
        unit_label: row.unit_label,
        identity_validated: row.identity_validated,
        first_evaluable_month: row.month,
        last_evaluable_month: row.month,
        evaluable_rows: 0,
      });
    }
    const unit = units.get(key);
    unit.evaluable_rows += 1;
    unit.last_evaluable_month = row.month;
  }
  return [...units.values()].sort((a, b) => String(a.unit_label).localeCompare(String(b.unit_label)));
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
