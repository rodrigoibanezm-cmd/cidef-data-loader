import { calculateDailyCloseBacktestContext } from '../motors/daily-close-backtest-context-v01.js';
import { calculateVentasDailyOrganizationalContext } from '../motors/ventas-daily-organizational-context-v01.js';
import { calculateVentasContext } from '../ventas/buildVentasContext.js';
import { findTrainingStartMonth } from './findTrainingStartMonth.js';
import { buildCurrentForecast } from './buildCurrentForecast.js';
import { buildHistoricalAccuracy } from './historicalAccuracy.js';
import { learnCurrentCompletion } from './learnCurrentCompletion.js';
import { parseDailyCloseForecastInput } from './forecastInput.js';
import { validateCurrentForecast } from './validateCurrentForecast.js';

export function buildDailyCloseForecast(rows, identityMaps, input = {}, now = new Date()) {
  const parsed = parseDailyCloseForecastInput(input, now);
  const trainingStartMonth = findTrainingStartMonth(rows, parsed.trainingEndMonth);
  const trainingContext = calculateDailyCloseBacktestContext(
    rows,
    identityMaps,
    { start_month: trainingStartMonth, end_month: parsed.trainingEndMonth },
    now,
  );
  const ventasContext = calculateVentasContext(rows, { cutoffDate: parsed.cutoffDate });
  const currentContext = calculateVentasDailyOrganizationalContext(
    ventasContext,
    identityMaps,
    { cutoffDate: parsed.cutoffDate },
  );
  const companyLearned = learnCurrentCompletion(
    trainingContext.company_observations,
    parsed.dayOfMonth,
  );
  const storeLearned = learnCurrentCompletion(
    trainingContext.store_observations,
    parsed.dayOfMonth,
  );
  const forecast = buildCurrentForecast(currentContext, companyLearned, storeLearned);
  const historicalAccuracy = buildHistoricalAccuracy(trainingContext, {
    startMonth: trainingStartMonth,
    endMonth: parsed.trainingEndMonth,
    dayOfMonth: parsed.dayOfMonth,
  });
  const checked = validateCurrentForecast({ parsed, currentContext, trainingContext, forecast });
  const warnings = [...new Set([...trainingContext.warnings, ...currentContext.warnings])];
  if (!companyLearned.evaluable) warnings.push('CIDEF forecast is not evaluable at requested day');
  if (!storeLearned.evaluable) warnings.push('Store forecast is not evaluable at requested day');
  if (!historicalAccuracy.company) warnings.push('No walk-forward company accuracy available for requested day');
  if (!historicalAccuracy.stores_pooled) warnings.push('No pooled-store accuracy available for requested day');

  return {
    status: checked.ok ? (warnings.length ? 'warning' : 'ok') : 'warning',
    inputs: { cutoff_date: parsed.cutoffDate },
    as_of: { cutoff_date: parsed.cutoffDate, target_month: parsed.targetMonth, day_of_month: parsed.dayOfMonth },
    training: { start_month: trainingStartMonth, end_month: parsed.trainingEndMonth },
    forecast,
    historical_accuracy: historicalAccuracy,
    coverage: {
      source_rows: rows.length,
      current_cidef_stores_observed: forecast.stores.length,
      company_training_observations: companyLearned.training_observations,
      pooled_store_training_observations: storeLearned.training_observations,
      current_context: currentContext.coverage,
    },
    validation: checked.validations,
    warnings,
  };
}
