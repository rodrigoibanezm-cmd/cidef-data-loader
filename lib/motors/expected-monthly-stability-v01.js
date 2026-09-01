import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { EXPECTATION_CANDIDATES } from '../expectation/expectedCandidates.js';
import { rankExpectationWindows } from '../expectation/rankExpectationWindows.js';
import { calculateExpectedMonthlyBacktest } from './expected-monthly-backtest-v01.js';

export const ENGINE_NAME = 'expected_monthly_stability_v01';
export const ENGINE_VERSION = '0.1';

export function calculateExpectedMonthlyStability(sharedContext) {
  const backtest = calculateExpectedMonthlyBacktest(sharedContext);
  const rows = backtest.monthly_backtest;
  const candidateNames = Object.keys(EXPECTATION_CANDIDATES);
  const windows = rankExpectationWindows(rows, candidateNames);

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: backtest.status,
    policy: {
      source: 'expected_monthly_backtest_v01 monthly_backtest',
      formulas: 'unchanged',
      ranking: backtest.policy.ranking,
      rolling_windows: ['2023-latest', '2024-latest', '2025-latest'],
      calendar_years: 'all evaluable years',
    },
    global_winner: backtest.winner,
    rolling_windows: windows.rolling,
    calendar_years: windows.years,
    validation: {
      backtest_ok: backtest.status === 'ok',
      candidates_evaluated: candidateNames.length,
      windows_have_rows: [...windows.rolling, ...windows.years].every((row) => row.months_evaluated > 0),
    },
  };
}

export async function expectedMonthlyStabilityV01({ sharedContext } = {}) {
  const ctx = sharedContext ?? await buildVentasContext();
  return calculateExpectedMonthlyStability(ctx);
}
