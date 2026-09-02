import { calculateShareMetrics } from './shareMetrics.js';

export function buildCandidateResults(rows, candidates, commonRows) {
  return candidates.map((candidate) => {
    const specific = rows.filter((row) => row.predictions[candidate.name].evaluable);
    return {
      candidate: candidate.name,
      required_history_months: candidate.lag,
      evaluable_rows: specific.length,
      non_evaluable_missing_history: rows.length - specific.length,
      coverage_pct: rows.length ? specific.length / rows.length : null,
      candidate_specific_metrics: calculateShareMetrics(specific, candidate.name),
      common_metrics: calculateShareMetrics(commonRows, candidate.name),
    };
  });
}

export function buildUnitResults(rows, candidates) {
  const units = new Map();
  for (const row of rows) {
    if (!units.has(row.unit_key)) units.set(row.unit_key, []);
    units.get(row.unit_key).push(row);
  }
  return [...units.entries()].flatMap(([unitKey, unitRows]) => candidates.map((candidate) => {
    const evaluable = unitRows.filter((row) => row.predictions[candidate.name].evaluable);
    const sample = unitRows[0];
    return {
      unit_key: unitKey,
      sucursal_id: sample.sucursal_id,
      persona_id: sample.persona_id,
      candidate: candidate.name,
      target_rows: unitRows.length,
      evaluable_rows: evaluable.length,
      ...calculateShareMetrics(evaluable, candidate.name),
    };
  }));
}
