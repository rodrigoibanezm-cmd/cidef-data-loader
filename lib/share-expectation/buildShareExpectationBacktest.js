import { shiftMonth } from '../expectation/monthSeries.js';
import { buildVentasOrganizationalContext } from '../ventas-org/buildVentasOrganizationalContext.js';
import { buildShareSeries } from './buildShareSeries.js';
import { buildUnitPredictions } from './shareCandidates.js';
import { calculateShareMetrics, rankShareCandidates } from './shareMetrics.js';
import { buildTemporalStability } from './shareStability.js';

function predictionRows(series, parsed) {
  return [...series.units.values()].flatMap((unitRows) => buildUnitPredictions(
    unitRows, parsed.candidates, parsed.startMonth, parsed.endMonth,
  ));
}

function candidateResults(rows, candidates, commonRows) {
  return candidates.map((candidate) => {
    const specific = rows.filter((row) => row.predictions[candidate.name].evaluable);
    return {
      candidate: candidate.name,
      required_history_months: candidate.lag,
      evaluable_rows: specific.length,
      non_evaluable_missing_history: rows.length - specific.length,
      coverage_pct: rows.length ? specific.length / rows.length : null,
      candidate_specific_metrics: calculateShareMetrics(specific, candidate.name),
      common_metrics: calculateShareMetrics(commonRows, candidate.name),
    };
  });
}

function unitResults(rows, candidates) {
  const units = new Map();
  for (const row of rows) {
    if (!units.has(row.unit_key)) units.set(row.unit_key, []);
    units.get(row.unit_key).push(row);
  }
  return [...units.entries()].flatMap(([unitKey, unitRows]) => candidates.map((candidate) => {
    const evaluable = unitRows.filter((row) => row.predictions[candidate.name].evaluable);
    const sample = unitRows[0];
    return {
      unit_key: unitKey,
      sucursal_id: sample.sucursal_id,
      persona_id: sample.persona_id,
      candidate: candidate.name,
      target_rows: unitRows.length,
      evaluable_rows: evaluable.length,
      ...calculateShareMetrics(evaluable, candidate.name),
    };
  }));
}

export function calculateShareExpectationBacktest(context, parsed) {
  const series = buildShareSeries(context, parsed.grain);
  const rows = predictionRows(series, parsed);
  const names = parsed.candidates.map((row) => row.name);
  const commonRows = rows.filter((row) => names.every(
    (name) => row.predictions[name].evaluable === true,
  ));
  const results = candidateResults(rows, parsed.candidates, commonRows);
  const ranking = rankShareCandidates(results);
  const validations = {
    organizational_context_ok: context.validation?.ok === true,
    shares_in_bounds: rows.every((row) => row.share >= 0 && row.share <= 1),
    expectations_in_bounds: rows.every((row) => names.every((name) => {
      const expected = row.predictions[name].expected;
      return expected == null || (expected >= 0 && expected <= 1);
    })),
    no_target_month_used: rows.every((row) => names.every((name) =>
      !row.predictions[name].source_months.includes(row.month))),
    no_future_month_used: rows.every((row) => names.every((name) =>
      row.predictions[name].source_months.every((month) => !month || month < row.month))),
    no_missing_month_imputation: true,
    seller_grain_includes_store: parsed.grain !== 'vendedor' || rows.every((row) => row.sucursal_id != null),
    common_comparison_window_equal: results.every((row) => row.common_metrics.rows_evaluated === commonRows.length),
    has_common_evaluable_rows: commonRows.length > 0,
  };
  validations.ok = Object.values(validations).every(Boolean);
  const zeroCommonUnits = new Set(unitResults(rows, parsed.candidates)
    .filter((row) => row.evaluable_rows === 0).map((row) => row.unit_key)).size;
  const warnings = [];
  if (zeroCommonUnits) warnings.push(`${zeroCommonUnits} unit(s) have no evaluable rows for at least one candidate`);
  if (!commonRows.length) warnings.push('No common evaluable rows across requested candidates');
  return {
    status: validations.ok ? 'ok' : 'warning',
    ranking,
    candidate_results: results,
    monthly_backtest: rows,
    unit_results: unitResults(rows, parsed.candidates),
    temporal_stability: buildTemporalStability(rows, names),
    coverage: {
      target_rows: rows.length,
      common_evaluable_rows: commonRows.length,
      common_coverage_pct: rows.length ? commonRows.length / rows.length : null,
    },
    validation: validations,
    warnings,
  };
}

export async function buildShareExpectationBacktest(parsed) {
  const historyStart = shiftMonth(parsed.startMonth, -parsed.maxLag);
  const context = await buildVentasOrganizationalContext({
    startMonth: historyStart,
    endMonth: parsed.endMonth,
  });
  return calculateShareExpectationBacktest(context, parsed);
}
