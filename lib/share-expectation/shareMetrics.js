function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function calculateShareMetrics(rows, candidateName) {
  const errors = rows.map((row) => {
    const expected = row.predictions[candidateName].expected;
    return 100 * (row.share - expected);
  });
  if (!errors.length) {
    return { rows_evaluated: 0, mae_pp: null, bias_pp: null, median_absolute_error_pp: null };
  }
  const absolute = errors.map(Math.abs);
  return {
    rows_evaluated: errors.length,
    mae_pp: absolute.reduce((sum, value) => sum + value, 0) / errors.length,
    bias_pp: errors.reduce((sum, value) => sum + value, 0) / errors.length,
    median_absolute_error_pp: median(absolute),
  };
}

export function rankShareCandidates(candidateResults) {
  return [...candidateResults].sort((a, b) => {
    const mae = (a.common_metrics.mae_pp ?? Infinity) - (b.common_metrics.mae_pp ?? Infinity);
    if (mae) return mae;
    const bias = Math.abs(a.common_metrics.bias_pp ?? Infinity)
      - Math.abs(b.common_metrics.bias_pp ?? Infinity);
    if (bias) return bias;
    const med = (a.common_metrics.median_absolute_error_pp ?? Infinity)
      - (b.common_metrics.median_absolute_error_pp ?? Infinity);
    if (med) return med;
    return a.candidate.localeCompare(b.candidate);
  });
}
