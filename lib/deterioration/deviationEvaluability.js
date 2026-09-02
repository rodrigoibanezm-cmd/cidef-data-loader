export function deviationIsEvaluable(row, method) {
  return row.deviations?.[method] != null;
}

export function deviationUnavailableReason(row, method) {
  if (deviationIsEvaluable(row, method)) return null;
  if (method === 'relative') {
    return row.baseline_value <= 0 ? 'baseline_nonpositive' : null;
  }
  const history = row.deviations?.error_history_available ?? 0;
  if (method === 'scaled_mad') {
    return history < 3 ? 'insufficient_error_history' : 'zero_scale';
  }
  if (method === 'historical_percentile' && history < 3) {
    return 'insufficient_error_history';
  }
  return null;
}

export function countUnavailableReasons(rows, method) {
  const counts = { baseline_nonpositive: 0, insufficient_error_history: 0, zero_scale: 0 };
  for (const row of rows) {
    const reason = deviationUnavailableReason(row, method);
    if (reason) counts[reason] += 1;
  }
  return counts;
}
