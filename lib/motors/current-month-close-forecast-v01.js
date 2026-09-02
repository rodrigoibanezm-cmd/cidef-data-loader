import { calculateVentasContext } from '../ventas/buildVentasContext.js';
import { loadVentasRows } from '../ventas/loadVentasRows.js';
import { calculateVentasDailyOrganizationalContext } from './ventas-daily-organizational-context-v01.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import { parseLiveCutoff } from '../current-month-forecast/parseLiveCutoff.js';
import { loadCurrentCidefStores } from '../current-month-forecast/loadCurrentCidefStores.js';
import { densifyCurrentStores } from '../current-month-forecast/densifyCurrentStores.js';
import { buildHistoricalForecastState } from '../current-month-forecast/buildHistoricalForecastState.js';
import { buildLiveForecast, buildStoreForecasts } from '../current-month-forecast/buildLiveForecast.js';
import { validateCurrentMonthForecast } from '../current-month-forecast/validateCurrentMonthForecast.js';

export const ENGINE_NAME = 'current_month_close_forecast_v01';
export const ENGINE_VERSION = '0.1';

function predictabilityDay(rows, grain) {
  return rows.find((row) => row.grain === grain)?.predictability_day ?? null;
}

export function calculateCurrentMonthCloseForecast(
  rows,
  identityMaps,
  currentStores,
  input,
  now = new Date(),
) {
  const parsed = parseLiveCutoff(input, now);
  const ventas = calculateVentasContext(rows, { cutoffDate: parsed.cutoffDate });
  const dailyOrg = calculateVentasDailyOrganizationalContext(
    ventas,
    identityMaps,
    { cutoffDate: parsed.cutoffDate },
  );
  const historical = buildHistoricalForecastState(
    rows,
    identityMaps,
    parsed.targetMonth,
    parsed.dayOfMonth,
    now,
  );
  const denseStores = densifyCurrentStores(currentStores, dailyOrg.store_sales_to_date);
  const companyDay = predictabilityDay(historical.predictability, 'CIDEF_PROPIO');
  const storeDay = predictabilityDay(historical.predictability, 'TIENDA_PROPIA_POOLED');
  const company = buildLiveForecast({
    observed: dailyOrg.cidef_owned_sales_to_date,
    learned: historical.companyLearned,
    predictabilityDay: companyDay,
    dayOfMonth: parsed.dayOfMonth,
  });
  const stores = buildStoreForecasts(
    denseStores,
    historical.storeLearned,
    storeDay,
    parsed.dayOfMonth,
  );
  const checked = validateCurrentMonthForecast({
    dailyOrg,
    historyContext: historical.context,
    companyLearned: historical.companyLearned,
    storeLearned: historical.storeLearned,
    company,
    stores,
    currentStores,
    predictability: historical.predictability,
  });
  const warnings = [...dailyOrg.warnings, ...historical.context.warnings];
  for (const [name, value] of Object.entries(checked.validations)) {
    if (!value) warnings.push(`Validation failed: ${name}`);
  }

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: checked.ok ? 'ok' : 'warning',
    inputs: { cutoff_date: parsed.cutoffDate },
    policy: {
      recognition: 'cutoff-safe ventas_context_v01; no post-cutoff evidence',
      live_store_universe: "current sucursales_master rows with tipo_canal='CIDEF'; absent observed sale => LIVE_ZERO",
      completion: 'median historical completion at same calendar day using closed months before target_month',
      forecast: 'observed_to_date / learned_completion; learned_completion <= 0 => NOT_EVALUABLE',
      predictability: 'V0.1 defaults median APE <=20% and p90 APE <=40%, persistent through later evaluable days',
      persistence: 'runtime only',
    },
    as_of: {
      cutoff_date: parsed.cutoffDate,
      target_month: parsed.targetMonth,
      day_of_month: parsed.dayOfMonth,
    },
    historical: {
      backtest_start_month: historical.backtest_start_month,
      backtest_end_month: historical.backtest_end_month,
    },
    cidef_propio: company,
    tienda_propia: stores,
    coverage: {
      current_cidef_stores: currentStores.length,
      live_zero_stores: denseStores.filter((row) => row.observation_semantics === 'LIVE_ZERO').length,
      daily_organizational: dailyOrg.coverage,
    },
    validation: checked.validations,
    warnings,
  };
}

export async function currentMonthCloseForecastV01(input = {}) {
  const [rows, identityMaps, currentStores] = await Promise.all([
    loadVentasRows(),
    loadOrganizationalIdentityMaps(),
    loadCurrentCidefStores(),
  ]);
  return calculateCurrentMonthCloseForecast(rows, identityMaps, currentStores, input);
}
