function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function relativeGapPp(actualShare, expectedShare) {
  const actual = Number(actualShare);
  const expected = Number(expectedShare);
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return null;
  return 100 * (actual - expected);
}

export function summarizeRelativeGap(rows, candidateName) {
  const values = rows
    .map((row) => relativeGapPp(row.share, row.predictions[candidateName]?.expected))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!values.length) {
    return {
      rows: 0,
      min_pp: null,
      p10_pp: null,
      p25_pp: null,
      median_pp: null,
      mean_pp: null,
      p75_pp: null,
      p90_pp: null,
      max_pp: null,
    };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    rows: values.length,
    min_pp: values[0],
    p10_pp: quantile(values, 0.10),
    p25_pp: quantile(values, 0.25),
    median_pp: quantile(values, 0.50),
    mean_pp: mean,
    p75_pp: quantile(values, 0.75),
    p90_pp: quantile(values, 0.90),
    max_pp: values.at(-1),
  };
}
