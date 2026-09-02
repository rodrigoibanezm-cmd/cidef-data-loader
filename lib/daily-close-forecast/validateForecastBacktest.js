function closeEnough(a, b, tolerance = 1e-9) {
  return Math.abs(a - b) <= tolerance;
}

function summaryCountsReconcile(forecasts, candidateResults) {
  const counts = new Map();
  for (const row of forecasts || []) {
    const key = `${row.grain}|${row.day_of_month}`;
    const current = counts.get(key) || { total: 0, evaluable: 0 };
    current.total += 1;
    if (row.evaluable) current.evaluable += 1;
    counts.set(key, current);
  }
  return (candidateResults || []).every((row) => {
    const current = counts.get(`${row.grain}|${row.day_of_month}`);
    return current
      && current.total === row.target_observations
      && current.evaluable === row.targets_evaluable;
  });
}

export function validateForecastBacktest(forecasts, candidateResults) {
  const evaluable = (forecasts || []).filter((row) => row.evaluable);
  const validations = {
    training_precedes_target: (forecasts || []).every(
      (row) => row.training_last_month == null || row.training_last_month < row.target_month,
    ),
    learned_completion_in_bounds: (forecasts || []).every(
      (row) => row.learned_completion == null
        || (row.learned_completion >= 0 && row.learned_completion <= 1),
    ),
    forecast_only_when_completion_positive: (forecasts || []).every(
      (row) => row.evaluable === (row.actual_close > 0 && row.learned_completion > 0),
    ),
    forecast_formula_reconciles: evaluable.every(
      (row) => closeEnough(row.forecast_close, row.observed_to_date / row.learned_completion),
    ),
    signed_error_reconciles: evaluable.every((row) => closeEnough(
      row.signed_percentage_error,
      (row.forecast_close - row.actual_close) / row.actual_close,
    )),
    absolute_error_reconciles: evaluable.every(
      (row) => closeEnough(row.absolute_percentage_error, Math.abs(row.signed_percentage_error)),
    ),
    summary_counts_reconcile: summaryCountsReconcile(forecasts, candidateResults),
    no_nonfinite_evaluable_values: evaluable.every((row) => [
      row.forecast_close,
      row.signed_percentage_error,
      row.absolute_percentage_error,
    ].every(Number.isFinite)),
  };
  return { validations, ok: Object.values(validations).every(Boolean) };
}
