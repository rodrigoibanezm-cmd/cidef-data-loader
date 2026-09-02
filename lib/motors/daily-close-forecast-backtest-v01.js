import { aggregateForecastErrors } from '../daily-close-forecast/aggregateForecastErrors.js';
import { buildWalkForwardForecasts } from '../daily-close-forecast/buildWalkForwardForecasts.js';
import { findTrainingStartMonth } from '../daily-close-forecast/findTrainingStartMonth.js';
import { validateForecastBacktest } from '../daily-close-forecast/validateForecastBacktest.js';
import { assertClosedRange } from '../daily-close-backtest/monthRange.js';
import { calculateDailyCloseBacktestContext } from './daily-close-backtest-context-v01.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import { loadVentasRows } from '../ventas/loadVentasRows.js';

export const ENGINE_NAME = 'daily_close_forecast_backtest_v01';
export const ENGINE_VERSION = '0.2';

export function calculateDailyCloseForecastBacktest(rows, identityMaps, input, now = new Date()) {
  const startMonth = input?.start_month;
  const endMonth = input?.end_month;
  const targetMonths = assertClosedRange(startMonth, endMonth, now);
  const trainingStartMonth = findTrainingStartMonth(rows, endMonth);
  const context = calculateDailyCloseBacktestContext(
    rows,
    identityMaps,
    { start_month: trainingStartMonth, end_month: endMonth },
    now,
  );

  const company = buildWalkForwardForecasts(context.company_observations, {
    grain: 'CIDEF_PROPIO', startMonth, endMonth,
  });
  const stores = buildWalkForwardForecasts(context.store_observations, {
    grain: 'TIENDA_PROPIA_POOLED', startMonth, endMonth,
  });
  const sellers = buildWalkForwardForecasts(context.seller_observations, {
    grain: 'VENDEDOR_CIDEF_POOLED', startMonth, endMonth,
  });
  const forecasts = [...company, ...stores, ...sellers];
  const candidateResults = aggregateForecastErrors(forecasts);
  const checked = validateForecastBacktest(forecasts, candidateResults);
  const warnings = [...context.warnings];
  if (context.status !== 'ok') warnings.push('Underlying daily close backtest context is not ok');
  for (const [name, value] of Object.entries(checked.validations)) {
    if (!value) warnings.push(`Validation failed: ${name}`);
  }

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.status === 'ok' && checked.ok ? 'ok' : 'warning',
    inputs: { start_month: startMonth, end_month: endMonth },
    policy: {
      candidate: 'median_completion_all_prior',
      forecast: 'observed_to_date / median(prior completion ratios at same calendar day)',
      training: 'all available closed observations strictly before target_month',
      company_grain: 'CIDEF_PROPIO',
      store_grain: 'TIENDA_PROPIA pooled; no volume segmentation in v0.1',
      seller_grain: 'VENDEDOR_CIDEF pooled; observed store + persona unit; no individual fitting',
      zero_training_completion: 'included in median; learned median <= 0 => NOT_EVALUABLE',
      target_label: 'actual_close is evaluation-only and not used in forecast formula',
      error_unit: 'percent',
      persistence: 'runtime only',
    },
    coverage: {
      source_rows: (rows || []).length,
      training_start_month: trainingStartMonth,
      target_months_requested: targetMonths.length,
      company_targets: company.length,
      company_targets_evaluable: company.filter((row) => row.evaluable).length,
      store_targets: stores.length,
      store_targets_evaluable: stores.filter((row) => row.evaluable).length,
      seller_targets: sellers.length,
      seller_targets_evaluable: sellers.filter((row) => row.evaluable).length,
    },
    validation: {
      underlying_context_ok: context.status === 'ok',
      target_actual_close_not_used_in_forecast: true,
      no_store_volume_segmentation: true,
      seller_uses_certified_vendedor_cidef: true,
      ...checked.validations,
    },
    warnings,
    candidate_results: candidateResults,
  };
}

export async function dailyCloseForecastBacktestV01(input = {}) {
  const [rows, identityMaps] = await Promise.all([
    loadVentasRows(),
    loadOrganizationalIdentityMaps(),
  ]);
  return calculateDailyCloseForecastBacktest(rows, identityMaps, input);
}
