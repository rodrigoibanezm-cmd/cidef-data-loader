function formulaOk(row) {
  if (row.forecast_status === 'NOT_EVALUABLE') return row.forecast_close == null;
  const expected = row.observed_to_date / row.learned_completion;
  return Math.abs(row.forecast_close - expected) < 1e-9;
}

function completionInBounds(learned) {
  return learned.learned_completion == null
    || (learned.learned_completion >= 0 && learned.learned_completion <= 1);
}

export function validateCurrentMonthForecast({
  dailyOrg,
  historyContext,
  companyLearned,
  storeLearned,
  company,
  stores,
  currentStores,
  predictability,
}) {
  const storeObserved = stores.reduce((sum, row) => sum + row.observed_to_date, 0);
  const predictabilityFound = company.predictability_day != null
    && stores.every((row) => row.predictability_day != null);
  const validations = {
    source_daily_organizational_context_ok: dailyOrg?.status === 'ok',
    source_history_context_ok: historyContext?.status === 'ok',
    learned_completion_company_in_bounds: completionInBounds(companyLearned),
    learned_completion_store_in_bounds: completionInBounds(storeLearned),
    historical_completion_observations_available: companyLearned.training_observations > 0
      && storeLearned.training_observations > 0,
    company_forecast_formula_reconciles: formulaOk(company),
    store_forecast_formula_reconciles: stores.every(formulaOk),
    cidef_owned_reconciles_with_live_roster: storeObserved === dailyOrg.cidef_owned_sales_to_date,
    current_cidef_roster_complete: stores.length === currentStores.length,
    current_roster_channels_valid: currentStores.every((row) => row.tipo_canal === 'CIDEF'),
    predictability_day_available: predictabilityFound,
  };
  return { validations, ok: Object.values(validations).every(Boolean) };
}
