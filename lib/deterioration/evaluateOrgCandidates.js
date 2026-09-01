import { evaluatePersistence, isAdverse } from './orgPersistence.js';

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.unit_id}|${row.baseline}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) group.sort((a, b) => a.month.localeCompare(b.month));
  return groups;
}

function futureStats(group, index) {
  const future = group.slice(index + 1, index + 4);
  const one = future[0] || null;
  const two = future.slice(0, 2);
  const three = future.slice(0, 3);
  return {
    next_error: one?.deviations?.error ?? null,
    next_reverted: one ? one.deviations.error >= 0 : null,
    next_2_all_negative: two.length === 2 ? two.every((row) => row.deviations.error < 0) : null,
    next_3_all_negative: three.length === 3 ? three.every((row) => row.deviations.error < 0) : null,
  };
}

function rate(values) {
  const known = values.filter((value) => value != null);
  if (!known.length) return null;
  return known.filter(Boolean).length / known.length;
}

export function evaluateOrgCandidates(rows, parsed) {
  const groups = groupRows(rows);
  const episodes = [];
  const candidateResults = [];

  for (const baseline of parsed.baselines) {
    for (const method of parsed.deviations) {
      for (const rule of parsed.persistence) {
        const found = [];
        for (const group of groups.values()) {
          if (group[0]?.baseline !== baseline) continue;
          let active = false;
          for (let i = 0; i < group.length; i += 1) {
            const evidence = evaluatePersistence(rule, group.slice(0, i + 1), method);
            if (!evidence) {
              if (!isAdverse(group[i], method)) active = false;
              continue;
            }
            if (active) continue;
            active = true;
            const row = group[i];
            const episode = {
              unit_id: row.unit_id,
              unit_label: row.unit_label,
              baseline,
              deviation_method: method,
              persistence_rule: rule,
              onset_month: evidence.onset_month,
              confirmation_month: row.month,
              lead_periods: Math.max(0, evidence.evidence_months.length - 1),
              confirmation_error: row.deviations.error,
              ...futureStats(group, i),
            };
            found.push(episode);
            episodes.push(episode);
          }
        }
        candidateResults.push({
          baseline,
          deviation_method: method,
          persistence_rule: rule,
          episodes: found.length,
          immediate_reversal_rate: rate(found.map((row) => row.next_reverted)),
          next_2_persistent_rate: rate(found.map((row) => row.next_2_all_negative)),
          next_3_persistent_rate: rate(found.map((row) => row.next_3_all_negative)),
        });
      }
    }
  }
  return { candidateResults, episodes };
}
