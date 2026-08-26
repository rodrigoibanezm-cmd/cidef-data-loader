import { reconcileUniverse } from '../vin-auditors.js';

export function calculateCoverage(source, eligible, universe, filtered, used) {
  const excludedIneligible = source - eligible;
  const excludedByUniverse = eligible - universe;
  const excludedByFilter = universe - filtered;
  const excludedInvalid = filtered - used;
  const reconciliation = reconcileUniverse({
    source,
    eligible,
    universe,
    filtered,
    used,
    excludedIneligible,
    excludedByUniverse,
    excludedByFilter,
    excludedInvalid,
  });
  return {
    source,
    eligible,
    universe,
    filtered,
    used,
    excludedIneligible,
    excludedByUniverse,
    excludedByFilter,
    excludedInvalid,
    reconciliation,
  };
}

export function coverageOutput(input, counts) {
  if (input.options?.include_coverage === false) return undefined;
  return {
    source_rows: counts.source,
    eligible_vin: counts.eligible,
    universe_rows: counts.universe,
    filtered_rows: counts.filtered,
    normalized_rows: counts.used,
    used_rows: counts.used,
    excluded: [
      { reason:'INELIGIBLE_VIN', rows:counts.excludedIneligible },
      { reason:'EXCLUDED_BY_UNIVERSE', rows:counts.excludedByUniverse },
      { reason:'EXCLUDED_BY_FILTER', rows:counts.excludedByFilter },
      { reason:'INVALID_REQUIRED_FIELD', rows:counts.excludedInvalid },
    ],
  };
}
