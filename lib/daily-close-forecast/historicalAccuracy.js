import { aggregateForecastErrors } from './aggregateForecastErrors.js';
import { buildWalkForwardForecasts } from './buildWalkForwardForecasts.js';

function accuracyFor(observations, grain, startMonth, endMonth, dayOfMonth) {
  const forecasts = buildWalkForwardForecasts(observations, {
    grain, startMonth, endMonth,
  });
  return aggregateForecastErrors(forecasts).find(
    (row) => row.grain === grain && row.day_of_month === Number(dayOfMonth),
  ) ?? null;
}

export function buildHistoricalAccuracy(
  trainingContext,
  { startMonth, endMonth, dayOfMonth },
) {
  return {
    company: accuracyFor(
      trainingContext.company_observations,
      'CIDEF_PROPIO',
      startMonth,
      endMonth,
      dayOfMonth,
    ),
    stores_pooled: accuracyFor(
      trainingContext.store_observations,
      'TIENDA_PROPIA_POOLED',
      startMonth,
      endMonth,
      dayOfMonth,
    ),
  };
}
