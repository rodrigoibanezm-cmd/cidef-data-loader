function forecastValue(observed, learned) {
  if (!learned?.evaluable) return null;
  return observed / learned.learned_completion;
}

function evidence(learned) {
  return {
    learned_completion: learned.learned_completion,
    historical_observations: learned.training_observations,
    historical_months: learned.training_months,
    historical_first_month: learned.training_first_month,
    historical_last_month: learned.training_last_month,
  };
}

export function buildLiveForecast({ observed, learned, predictabilityDay, dayOfMonth }) {
  const forecast = forecastValue(observed, learned);
  return {
    observed_to_date: observed,
    ...evidence(learned),
    forecast_close: forecast,
    forecast_status: forecast == null ? 'NOT_EVALUABLE' : 'EVALUABLE',
    predictability_day: predictabilityDay,
    is_predictable: predictabilityDay != null && dayOfMonth >= predictabilityDay,
  };
}

export function buildStoreForecasts(stores, learned, predictabilityDay, dayOfMonth) {
  return (stores || []).map((store) => ({
    sucursal_id: store.sucursal_id,
    sucursal: store.sucursal,
    observation_semantics: store.observation_semantics,
    ...buildLiveForecast({
      observed: store.observed_to_date,
      learned,
      predictabilityDay,
      dayOfMonth,
    }),
  }));
}
