import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { buildBacktestRows } from '../expectation/buildBacktestRows.js';
import {
  attachMonthlyErrors,
  calculateForecastMetrics,
} from '../expectation/calculateForecastMetrics.js';
import { EXPECTATION_CANDIDATES } from '../expectation/expectedCandidates.js';
import { rankExpectedCandidates } from '../expectation/rankExpectedCandidates.js';

export const ENGINE_NAME = 'expected_monthly_backtest_v01';
export const ENGINE_VERSION = '0.1';

export function calculateExpectedMonthlyBacktest(sharedContext) {
  const monthlySales = sharedContext?.monthlySales;
  if (!Array.isArray(monthlySales)) throw new Error('ventas sharedContext with monthlySales is required');

  const window = buildBacktestRows(monthlySales);
  const names = Object.keys(EXPECTATION_CANDIDATES);
  const metrics = names.map((name) => calculateForecastMetrics(window.rows, name));
  const ranking = rankExpectedCandidates(metrics);
  const contextOk = sharedContext?.validation?.ok === true;
  const hasEvaluation = window.rows.length > 0;

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: contextOk && hasEvaluation ? 'ok' : 'warning',
    policy: {
      method: 'walk-forward monthly backtest',
      information_cutoff: 'each target month uses only prior months',
      comparison_window: 'common months where all candidates are evaluable',
      ranking: 'WAPE asc, absolute bias asc, MAE asc, candidate name asc',
    },
    winner: ranking[0]?.candidate ?? null,
    ranking,
    monthly_backtest: attachMonthlyErrors(window.rows),
    coverage: {
      source_months: monthlySales.length,
      months_evaluated: window.rows.length,
      skipped_months: window.skipped_months.length,
      first_evaluable_month: window.first_evaluable_month,
      last_evaluable_month: window.last_evaluable_month,
    },
    validation: {
      ventas_context_ok: contextOk,
      common_window_ok: metrics.every((row) => row.months_evaluated === window.rows.length),
      candidates_evaluated: names.length,
      has_evaluable_months: hasEvaluation,
    },
  };
}

export async function expectedMonthlyBacktestV01({ sharedContext } = {}) {
  const ctx = sharedContext ?? await buildVentasContext();
  return calculateExpectedMonthlyBacktest(ctx);
}
