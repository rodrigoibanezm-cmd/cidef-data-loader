function project(observed, learned) {
  if (!learned?.evaluable) return null;
  return observed / learned.learned_completion;
}

function evidence(learned) {
  return {
    learned_completion: learned.learned_completion,
    training_observations: learned.training_observations,
    training_months: learned.training_months,
    training_first_month: learned.training_first_month,
    training_last_month: learned.training_last_month,
  };
}

export function buildCurrentForecast(currentContext, companyLearned, storeLearned) {
  const companyObserved = currentContext.cidef_owned_sales_to_date;
  const company = {
    grain: 'CIDEF_PROPIO',
    observed_to_date: companyObserved,
    forecast_close: project(companyObserved, companyLearned),
    evaluable: companyLearned.evaluable,
    ...evidence(companyLearned),
  };

  const stores = (currentContext.store_sales_to_date || [])
    .filter((row) => row.tipo_canal === 'CIDEF')
    .map((row) => ({
      grain: 'TIENDA_PROPIA',
      baseline_grain: 'TIENDA_PROPIA_POOLED',
      sucursal_id: row.sucursal_id,
      sucursal: row.sucursal,
      observed_to_date: row.month_sales_to_date,
      forecast_close: project(row.month_sales_to_date, storeLearned),
      evaluable: storeLearned.evaluable,
      ...evidence(storeLearned),
    }));

  return { company, stores };
}
