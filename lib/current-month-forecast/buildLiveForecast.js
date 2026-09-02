function forecastValue(observed, learned) {
  if (!(learned > 0)) return null;
  return observed / learned;
}

export function buildLiveForecast({
  observed,
  learned,
  predictabilityDay,
  dayOfMonth,
}) {
  const forecast = forecastValue(observed, learned.learned_completion);
  return {
    observed_to_date: observed,
    learned_completion: learned.learned_completion,
    historical_observations: learned.historical_observations,
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
