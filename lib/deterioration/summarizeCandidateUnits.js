import { isAdverse } from './orgPersistence.js';
import { countUnavailableReasons, deviationIsEvaluable } from './deviationEvaluability.js';
import {
  candidateUnitKey,
  indexEpisodesByCandidateUnit,
  summarizeEpisodeEvidence,
} from './unitEpisodeSummary.js';

function groupRowsByBaselineUnit(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.baseline}|${row.unit_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) group.sort((a, b) => a.month.localeCompare(b.month));
  return groups;
}

function averageSales(rows) {
  if (!rows.length) return null;
  return rows.reduce((sum, row) => sum + row.sales, 0) / rows.length;
}

function summarizeUnit(rows, baseline, method, rule, episodeIndex) {
  const first = rows[0];
  const signalMonths = rows.filter((row) => isAdverse(row, method)).map((row) => row.month);
  const deviationEvaluable = rows.filter((row) => deviationIsEvaluable(row, method)).length;
  const key = candidateUnitKey(baseline, method, rule, first.unit_id);
  return {
    baseline,
    deviation_method: method,
    persistence_rule: rule,
    unit_id: first.unit_id,
    unit_label: first.unit_label,
    identity_validated: rows.every((row) => row.identity_validated !== false),
    first_evaluable_month: first.month,
    last_evaluable_month: rows.at(-1).month,
    baseline_evaluable_rows: rows.length,
    deviation_evaluable_rows: deviationEvaluable,
    deviation_unavailable_rows: rows.length - deviationEvaluable,
    deviation_unavailable_reasons: countUnavailableReasons(rows, method),
    actual_sales_avg: averageSales(rows),
    signal_count: signalMonths.length,
    signal_months: signalMonths,
    ...summarizeEpisodeEvidence(episodeIndex.get(key)),
  };
}

export function summarizeCandidateUnits(rows, episodes, parsed) {
  const groups = groupRowsByBaselineUnit(rows);
  const episodeIndex = indexEpisodesByCandidateUnit(episodes);
  const output = [];
  for (const baseline of parsed.baselines) for (const method of parsed.deviations) {
    for (const rule of parsed.persistence) {
      for (const [key, group] of groups) {
        if (!key.startsWith(`${baseline}|`)) continue;
        output.push(summarizeUnit(group, baseline, method, rule, episodeIndex));
      }
    }
  }
  return output.sort((a, b) => (
    a.baseline.localeCompare(b.baseline)
    || a.deviation_method.localeCompare(b.deviation_method)
    || a.persistence_rule.localeCompare(b.persistence_rule)
    || String(a.unit_label).localeCompare(String(b.unit_label))
  ));
}
