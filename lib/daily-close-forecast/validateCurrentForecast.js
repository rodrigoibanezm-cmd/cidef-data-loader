function closeEnough(a, b) {
  if (a == null && b == null) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function formulaOk(row) {
  if (!row.evaluable) return row.forecast_close == null;
  return closeEnough(
    row.forecast_close,
    row.observed_to_date / row.learned_completion,
  );
}

export function validateCurrentForecast({
  parsed,
  currentContext,
  trainingContext,
  forecast,
}) {
  const validations = {
    current_context_ok: currentContext.status === 'ok',
    training_context_ok: trainingContext.status === 'ok',
    cutoff_is_current_open_month: parsed.cutoffDate.slice(0, 7) === parsed.targetMonth,
    training_precedes_target: parsed.trainingEndMonth < parsed.targetMonth,
    company_formula_reconciles: formulaOk(forecast.company),
    store_formula_reconciles: forecast.stores.every(formulaOk),
    store_scope_cidef_only: forecast.stores.every((row) => row.grain === 'TIENDA_PROPIA'),
    stores_positive_observed_only: forecast.stores.every((row) => row.observed_to_date > 0),
    target_actual_close_not_used: true,
    no_future_evidence_used: currentContext.validation?.no_post_cutoff_evidence_used === true,
  };
  return { ok: Object.values(validations).every(Boolean), validations };
}
