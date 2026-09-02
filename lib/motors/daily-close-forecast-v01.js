import { buildDailyCloseForecast } from '../daily-close-forecast/buildDailyCloseForecast.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import { loadVentasRows } from '../ventas/loadVentasRows.js';

export const ENGINE_NAME = 'daily_close_forecast_v01';
export const ENGINE_VERSION = '0.1';

export function calculateDailyCloseForecastV01(rows, identityMaps, input = {}, now = new Date()) {
  const result = buildDailyCloseForecast(rows, identityMaps, input, now);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    policy: {
      family: 'Familia 1 - EXPECTATIVA DE CIERRE',
      mode: 'CURRENT_OPEN_MONTH',
      company_baseline: 'median completion at same calendar day across all prior closed months',
      store_baseline: 'pooled CIDEF-store median completion at same calendar day across prior closed months',
      forecast: 'observed_to_date / learned_completion',
      store_scope: 'currently observed positive CIDEF stores only; absence is not zero',
      accuracy: 'historical walk-forward error using the same median-completion baseline',
      target_label: 'current-month actual_close is unavailable and never used',
      persistence: 'runtime only',
    },
    ...result,
  };
}

export async function dailyCloseForecastV01(input = {}) {
  const [rows, identityMaps] = await Promise.all([
    loadVentasRows(),
    loadOrganizationalIdentityMaps(),
  ]);
  return calculateDailyCloseForecastV01(rows, identityMaps, input);
}
