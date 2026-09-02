import { requiredMonths } from '../share-expectation/shareCandidates.js';
import { relativeGapPp } from '../share-expectation/shareGapStatistics.js';

const EPSILON = 1e-10;

function rowKey(row, grain) {
  return grain === 'tienda'
    ? `${row.month}|${row.sucursal_id}`
    : `${row.month}|${row.sucursal_id}|${row.persona_id}`;
}

function unitKey(row, grain) {
  return grain === 'tienda'
    ? String(row.sucursal_id)
    : `${row.sucursal_id}|${row.persona_id}`;
}

function expectedCertifiedRule(parsed, rule) {
  if (parsed.grain === 'tienda') return rule.name === 'median_3';
  return rule.name === 'moving_average_5';
}

export function validateRelativePerformance(context, series, parsed, rule, rows) {
  const keys = rows.map((row) => rowKey(row, parsed.grain));
  const validation = {
    source_context_ok: context.validation?.ok === true,
    output_grain_unique: new Set(keys).size === keys.length,
    shares_in_bounds: rows.every((row) => row.actual_share >= 0 && row.actual_share <= 1),
    sales_parent_evidence_present: rows.every((row) =>
      Number.isFinite(row.sales) && Number.isFinite(row.parent_sales) && row.parent_sales > 0),
    share_reconciles_with_sales: rows.every((row) =>
      Math.abs(row.actual_share - row.sales / row.parent_sales) < EPSILON),
    certified_baseline_used: expectedCertifiedRule(parsed, rule),
    exact_calendar_lags_only: rows.every((row) =>
      JSON.stringify(row.source_months) === JSON.stringify(requiredMonths(rule, row.month))),
    no_missing_month_imputation: rows.every((row) => {
      const unitRows = series.units.get(unitKey(row, parsed.grain)) || [];
      const observed = new Set(unitRows.map((item) => item.month));
      return row.evaluable === row.source_months.every((month) => observed.has(month));
    }),
    no_target_or_future_month_used: rows.every((row) =>
      row.source_months.every((month) => month < row.month)),
    expectations_in_bounds: rows.every((row) => row.expected_share == null
      || (row.expected_share >= 0 && row.expected_share <= 1)),
    relative_gap_reconciles: rows.every((row) => !row.evaluable
      || Math.abs(row.relative_gap_pp - relativeGapPp(row.actual_share, row.expected_share)) < EPSILON),
    evaluable_semantics_ok: rows.every((row) => row.evaluable
      ? row.expected_share != null && row.relative_gap_pp != null
      : row.expected_share == null && row.relative_gap_pp == null),
    seller_grain_includes_store: parsed.grain !== 'vendedor'
      || rows.every((row) => row.sucursal_id != null && row.persona_id != null),
    target_months_closed: rows.every((row) => row.month < parsed.currentMonth),
  };
  validation.ok = Object.values(validation).every(Boolean);
  return validation;
}
