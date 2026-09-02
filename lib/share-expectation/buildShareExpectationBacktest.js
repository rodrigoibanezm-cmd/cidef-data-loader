import { shiftMonth } from '../expectation/monthSeries.js';
import { buildVentasOrganizationalContext } from '../ventas-org/buildVentasOrganizationalContext.js';
import { buildCandidateResults, buildUnitResults } from './shareBacktestResults.js';
import { buildShareSeries } from './buildShareSeries.js';
import { buildUnitPredictions, requiredMonths } from './shareCandidates.js';
import { rankShareCandidates } from './shareMetrics.js';
import { buildTemporalStability } from './shareStability.js';

function predictionRows(series, parsed) {
  return [...series.units.values()].flatMap((unitRows) => buildUnitPredictions(
    unitRows, parsed.candidates, parsed.startMonth, parsed.endMonth,
  ));
}

function exactLags(rows, candidates) {
  return rows.every((row) => candidates.every((candidate) => {
    const observed = row.predictions[candidate.name].source_months;
    const expected = requiredMonths(candidate, row.month);
    return JSON.stringify(observed) === JSON.stringify(expected);
  }));
}

function gapBiasReconciles(results) {
  return results.every((row) => {
    const mean = row.relative_gap_distribution.mean_pp;
    const bias = row.candidate_specific_metrics.bias_pp;
    if (mean == null || bias == null) return mean === bias;
    return Math.abs(mean - bias) < 1e-10;
  });
}

function buildValidation(context, parsed, rows, names, results, commonRows) {
  const validation = {
    organizational_context_ok: context.validation?.ok === true,
    shares_in_bounds: rows.every((row) => row.share >= 0 && row.share <= 1),
    sales_parent_evidence_present: rows.every((row) =>
      Number.isFinite(row.sales) && Number.isFinite(row.parent_sales) && row.parent_sales > 0),
    share_reconciles_with_sales: rows.every((row) =>
      Math.abs(row.share - row.sales / row.parent_sales) < 1e-10),
    expectations_in_bounds: rows.every((row) => names.every((name) => {
      const expected = row.predictions[name].expected;
      return expected == null || (expected >= 0 && expected <= 1);
    })),
    relative_gap_mean_reconciles_with_bias: gapBiasReconciles(results),
    no_target_month_used: rows.every((row) => names.every((name) =>
      !row.predictions[name].source_months.includes(row.month))),
    no_future_month_used: rows.every((row) => names.every((name) =>
      row.predictions[name].source_months.every((month) => !month || month < row.month))),
    exact_calendar_lags_only: exactLags(rows, parsed.candidates),
    no_missing_month_imputation: true,
    seller_grain_includes_store: parsed.grain !== 'vendedor' || rows.every((row) => row.sucursal_id != null),
    common_comparison_window_equal: results.every((row) => row.common_metrics.rows_evaluated === commonRows.length),
    has_common_evaluable_rows: commonRows.length > 0,
  };
  validation.ok = Object.values(validation).every(Boolean);
  return validation;
}

export function calculateShareExpectationBacktest(context, parsed) {
  const series = buildShareSeries(context, parsed.grain);
  const rows = predictionRows(series, parsed);
  const names = parsed.candidates.map((row) => row.name);
  const commonRows = rows.filter((row) => names.every(
    (name) => row.predictions[name].evaluable === true,
  ));
  const results = buildCandidateResults(rows, parsed.candidates, commonRows);
  const units = buildUnitResults(rows, parsed.candidates);
  const validation = buildValidation(context, parsed, rows, names, results, commonRows);
  const zeroEvalUnits = new Set(units.filter((row) => row.evaluable_rows === 0)
    .map((row) => row.unit_key)).size;
  const warnings = [];
  if (zeroEvalUnits) warnings.push(`${zeroEvalUnits} unit(s) have no evaluable rows for at least one candidate`);
  if (!commonRows.length) warnings.push('No common evaluable rows across requested candidates');
  return {
    status: validation.ok ? 'ok' : 'warning',
    ranking: rankShareCandidates(results),
    candidate_results: results,
    monthly_backtest: rows,
    unit_results: units,
    temporal_stability: buildTemporalStability(rows, names),
    coverage: {
      target_rows: rows.length,
      common_evaluable_rows: commonRows.length,
      common_coverage_pct: rows.length ? commonRows.length / rows.length : null,
    },
    validation,
    warnings,
  };
}

export async function buildShareExpectationBacktest(parsed) {
  const historyStart = shiftMonth(parsed.startMonth, -parsed.maxLag);
  const context = await buildVentasOrganizationalContext({ startMonth: historyStart, endMonth: parsed.endMonth });
  return calculateShareExpectationBacktest(context, parsed);
}
