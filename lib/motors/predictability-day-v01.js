import { derivePredictabilityDays } from '../predictability-day/findPredictabilityDay.js';
import { parsePredictabilityThresholds } from '../predictability-day/parseThresholds.js';
import { dailyCloseForecastBacktestV01 } from './daily-close-forecast-backtest-v01.js';

export const ENGINE_NAME = 'predictability_day_v01';
export const ENGINE_VERSION = '0.1';

export function calculatePredictabilityDayFromBacktest(backtest, input = {}) {
  const thresholds = parsePredictabilityThresholds(input);
  const results = derivePredictabilityDays(backtest?.candidate_results, thresholds);
  const grainsComplete = results.length === 2
    && results.every((row) => row.last_evaluable_day != null);
  const foundForAllGrains = results.every((row) => row.predictability_day != null);
  const maintained = results.every((row) => row.maintained_through_last_evaluable_day);
  const warnings = [...(backtest?.warnings || [])];

  if (backtest?.status !== 'ok') warnings.push('Underlying forecast backtest is not ok');
  if (!grainsComplete) warnings.push('Expected predictability grains are incomplete');
  if (!foundForAllGrains) warnings.push('Predictability day not found for one or more grains');

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: backtest?.status === 'ok' && grainsComplete && foundForAllGrains && maintained
      ? 'ok'
      : 'warning',
    inputs: {
      start_month: input.start_month,
      end_month: input.end_month,
      median_ape_threshold_pct: thresholds.median_ape_pct,
      p90_ape_threshold_pct: thresholds.p90_ape_pct,
    },
    policy: {
      source_engine: 'daily_close_forecast_backtest_v01',
      candidate: 'median_completion_all_prior',
      rule: 'earliest evaluable day meeting both error thresholds and maintaining them through all later evaluable calendar days',
      default_thresholds: 'median APE <= 20%; p90 APE <= 40%',
      persistence: 'runtime only',
    },
    source_backtest: {
      version: backtest?.version ?? null,
      status: backtest?.status ?? null,
      coverage: backtest?.coverage ?? null,
    },
    validation: {
      source_backtest_ok: backtest?.status === 'ok',
      expected_grains_complete: grainsComplete,
      predictability_day_found_for_all_grains: foundForAllGrains,
      criterion_maintained_through_close: maintained,
    },
    warnings,
    results,
  };
}

export async function predictabilityDayV01(input = {}) {
  const backtest = await dailyCloseForecastBacktestV01(input);
  return calculatePredictabilityDayFromBacktest(backtest, input);
}
