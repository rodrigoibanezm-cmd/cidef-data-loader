import { observationUnitIndex } from './buildObservationSnapshots.js';

export function buildUnitUniverseAudit(oldSnapshots, oldBacktest) {
  const observed = observationUnitIndex(oldSnapshots);
  const candidateIds = new Set(oldBacktest.rows.map((row) => String(row.unit_id)));
  const withoutCandidate = [];

  for (const [unitId, identity] of observed) {
    if (candidateIds.has(String(unitId))) continue;
    withoutCandidate.push({
      unit_id: identity.unit_id,
      unit_label: identity.unit_label,
      reason: 'NO_CANDIDATE_EVALUABLE_ROW_IN_WINDOW',
    });
  }

  withoutCandidate.sort((a, b) => Number(a.unit_id) - Number(b.unit_id));
  return {
    observed_units_total: observed.size,
    candidate_evaluable_units: candidateIds.size,
    units_without_candidate_rows: withoutCandidate.length,
    units_without_candidate_rows_detail: withoutCandidate,
  };
}
