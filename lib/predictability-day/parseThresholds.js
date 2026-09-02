function finitePercent(value, fallback, name) {
  const resolved = value == null ? fallback : Number(value);
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1000) {
    throw new Error(`${name} must be a finite percentage between 0 and 1000`);
  }
  return resolved;
}

export function parsePredictabilityThresholds(input = {}) {
  return {
    median_ape_pct: finitePercent(
      input.median_ape_threshold_pct,
      20,
      'median_ape_threshold_pct',
    ),
    p90_ape_pct: finitePercent(
      input.p90_ape_threshold_pct,
      40,
      'p90_ape_threshold_pct',
    ),
  };
}
