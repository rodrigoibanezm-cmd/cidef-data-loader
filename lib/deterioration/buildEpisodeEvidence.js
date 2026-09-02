import { shiftMonth } from '../expectation/monthSeries.js';
import { isAdverse } from './orgPersistence.js';

function rowKey(row) {
  return `${row.unit_id}|${row.baseline}`;
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) group.sort((a, b) => a.month.localeCompare(b.month));
  return groups;
}

function evidenceRow(row, method) {
  if (!row) return null;
  return {
    month: row.month,
    sales: row.sales,
    baseline: row.baseline_value,
    error: row.deviations.error,
    deviation_method: method,
    deviation_value: row.deviations[method] ?? null,
    error_history_available: row.deviations.error_history_available,
    adverse: isAdverse(row, method),
  };
}

function contiguousContext(group, onsetMonth, limit, method) {
  const onsetIndex = group.findIndex((row) => row.month === onsetMonth);
  if (onsetIndex <= 0) return [];
  const context = [];
  let expected = shiftMonth(onsetMonth, -1);
  for (let i = onsetIndex - 1; i >= 0 && context.length < limit; i -= 1) {
    if (group[i].month !== expected) break;
    context.push(evidenceRow(group[i], method));
    expected = shiftMonth(expected, -1);
  }
  return context.reverse();
}

function episodeEvidence(episode, group, parsed) {
  const byMonth = new Map(group.map((row) => [row.month, row]));
  const method = parsed.deviations[0];
  const evidenceMonths = episode.evidence_months || [];
  return {
    unit_id: episode.unit_id,
    unit_label: episode.unit_label,
    onset_month: episode.onset_month,
    confirmation_month: episode.confirmation_month,
    lead_periods: episode.lead_periods,
    candidate: {
      baseline: episode.baseline,
      deviation_method: episode.deviation_method,
      persistence_rule: episode.persistence_rule,
    },
    signal_evidence: {
      pre_onset_context: contiguousContext(group, episode.onset_month, parsed.contextMonths, method),
      onset: evidenceRow(byMonth.get(episode.onset_month), method),
      confirmation: evidenceRow(byMonth.get(episode.confirmation_month), method),
      persistence_rows: evidenceMonths.map((month) => evidenceRow(byMonth.get(month), method)),
    },
    future_evaluation: {
      next_error: episode.next_error,
      next_reverted: episode.next_reverted,
      next_2_all_negative: episode.next_2_all_negative,
      next_3_all_negative: episode.next_3_all_negative,
    },
  };
}

export function buildEpisodeEvidence(rows, episodes, parsed) {
  const groups = groupRows(rows);
  const filtered = parsed.detailUnitId == null
    ? episodes
    : episodes.filter((episode) => episode.unit_id === parsed.detailUnitId);
  const matched = filtered.map((episode) => {
    const group = groups.get(`${episode.unit_id}|${episode.baseline}`) || [];
    return episodeEvidence(episode, group, parsed);
  });
  const returned = matched.slice(0, parsed.detailLimit);
  const complete = returned.every((episode) => {
    const signal = episode.signal_evidence;
    return signal.onset && signal.confirmation && signal.persistence_rows.every(Boolean);
  });
  const noFutureLeakage = returned.every((episode) => {
    const signal = episode.signal_evidence;
    const rowsUsed = [...signal.pre_onset_context, ...signal.persistence_rows];
    return rowsUsed.every((row) => row.month <= episode.confirmation_month);
  });
  return {
    episode_evidence: returned,
    detail: {
      matched_rows: matched.length,
      returned_rows: returned.length,
      truncated: matched.length > parsed.detailLimit,
    },
    validation: {
      episode_signal_evidence_complete: complete,
      signal_context_uses_no_future_rows: noFutureLeakage,
    },
  };
}
