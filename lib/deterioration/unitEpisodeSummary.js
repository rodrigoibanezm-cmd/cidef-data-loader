export function candidateUnitKey(baseline, method, rule, unitId) {
  return `${baseline}|${method}|${rule}|${unitId}`;
}

export function indexEpisodesByCandidateUnit(episodes) {
  const index = new Map();
  for (const row of episodes) {
    const key = candidateUnitKey(
      row.baseline, row.deviation_method, row.persistence_rule, row.unit_id,
    );
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

function flagStats(rows, field) {
  const known = rows.map((row) => row[field]).filter((value) => value != null);
  const count = known.filter(Boolean).length;
  return { count, rate: known.length ? count / known.length : null };
}

export function summarizeEpisodeEvidence(rows = []) {
  const reversal = flagStats(rows, 'next_reverted');
  const next2 = flagStats(rows, 'next_2_all_negative');
  const next3 = flagStats(rows, 'next_3_all_negative');
  return {
    confirmed_episode_count: rows.length,
    confirmation_months: rows.map((row) => row.confirmation_month).sort(),
    immediate_reversal_count: reversal.count,
    immediate_reversal_rate: reversal.rate,
    next_2_persistent_count: next2.count,
    next_2_persistent_rate: next2.rate,
    next_3_persistent_count: next3.count,
    next_3_persistent_rate: next3.rate,
  };
}
