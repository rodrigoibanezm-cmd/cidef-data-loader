import { calculateDailyCloseBacktestContext } from '../motors/daily-close-backtest-context-v01.js';
import { buildWalkForwardForecasts } from '../daily-close-forecast/buildWalkForwardForecasts.js';
import { aggregateForecastErrors } from '../daily-close-forecast/aggregateForecastErrors.js';
import { findTrainingStartMonth } from '../daily-close-forecast/findTrainingStartMonth.js';
import { derivePredictabilityDays } from '../predictability-day/findPredictabilityDay.js';
import { parsePredictabilityThresholds } from '../predictability-day/parseThresholds.js';
import { shiftMonth } from '../expectation/monthSeries.js';
import { learnHistoricalCompletion } from './learnHistoricalCompletion.js';

const BACKTEST_START_MONTH = '2021-01';

export function buildHistoricalForecastState(rows, identityMaps, targetMonth, dayOfMonth, now) {
  const endMonth = shiftMonth(targetMonth, -1);
  const trainingStart = findTrainingStartMonth(rows, endMonth);
  const context = calculateDailyCloseBacktestContext(
    rows,
    identityMaps,
    { start_month: trainingStart, end_month: endMonth },
    now,
  );
  const company = buildWalkForwardForecasts(context.company_observations, {
    grain: 'CIDEF_PROPIO', startMonth: BACKTEST_START_MONTH, endMonth,
  });
  const stores = buildWalkForwardForecasts(context.store_observations, {
    grain: 'TIENDA_PROPIA_POOLED', startMonth: BACKTEST_START_MONTH, endMonth,
  });
  const candidateResults = aggregateForecastErrors([...company, ...stores]);
  const predictability = derivePredictabilityDays(
    candidateResults,
    parsePredictabilityThresholds({}),
  );
  return {
    context,
    backtest_start_month: BACKTEST_START_MONTH,
    backtest_end_month: endMonth,
    predictability,
    companyLearned: learnHistoricalCompletion(context.company_observations, dayOfMonth),
    storeLearned: learnHistoricalCompletion(context.store_observations, dayOfMonth),
  };
}
