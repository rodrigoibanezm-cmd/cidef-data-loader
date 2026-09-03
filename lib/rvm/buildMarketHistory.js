import { customGptDb } from '../custom-gpt/db.js';
import { parseMarketHistoryInput } from './marketHistoryInput.js';
import { buildMarketHistoryQuery } from './marketHistoryQuery.js';

function num(value) { return value == null ? null : Number(value); }
function pct(part, total) { return total === 0 ? null : part / total; }
const MAX_BREAKDOWN_ROWS = 5000;

export function assembleMarketHistory(scope, raw, needsIdentity, input = {}) {
  const totals = Object.fromEntries((raw.period_totals || []).map((row) => [row.period_id, num(row.universe_units)]));
  const warnings = [];
  if (Object.values(totals).every((value) => value === 0)) warnings.push('NO_RVM_EVIDENCE');
  const coverageRaw = raw.coverage || {};
  const coverage = {
    total_rows: Number(coverageRaw.total_rows || 0),
    total_units: num(coverageRaw.total_units) || 0,
    corrections_negative_units: num(coverageRaw.corrections_negative_units) || 0,
    non_standard_quantity_rows: Number(coverageRaw.non_standard_quantity_rows || 0),
  };
  if (needsIdentity) {
    coverage.resolved_units = num(coverageRaw.resolved_units) || 0;
    coverage.ambiguous_units = num(coverageRaw.ambiguous_units) || 0;
    coverage.unresolved_units = num(coverageRaw.unresolved_units) || 0;
    coverage.resolved_unit_pct = pct(coverage.resolved_units, coverage.total_units);
    coverage.ambiguous_unit_pct = pct(coverage.ambiguous_units, coverage.total_units);
    coverage.unresolved_unit_pct = pct(coverage.unresolved_units, coverage.total_units);
    coverage.status = coverage.ambiguous_units === 0 && coverage.unresolved_units === 0 ? 'COMPLETE' : 'PARTIAL';
    if (coverage.ambiguous_units !== 0) warnings.push('IDENTITY_AMBIGUOUS_PRESENT');
    if (coverage.unresolved_units !== 0) warnings.push('IDENTITY_UNRESOLVED_PRESENT');
    if (coverage.status === 'PARTIAL') warnings.push('IDENTITY_PARTIAL');
  } else coverage.status = 'NOT_APPLICABLE';
  const series = (raw.series || []).map((row) => ({ period_id: row.period_id, period: String(row.period_bucket).slice(0, 10), universe_units: num(row.universe_units) }));
  const rawBreakdownRows = raw.breakdown || [];
  const responseTooLarge = Boolean(scope.breakdown && rawBreakdownRows.length > MAX_BREAKDOWN_ROWS);
  if (responseTooLarge) warnings.push('RESPONSE_TOO_LARGE');
  const breakdown = scope.breakdown ? rawBreakdownRows.slice(0, MAX_BREAKDOWN_ROWS).map((row) => {
    const period = String(row.period_bucket).slice(0, 10);
    const universeUnits = series.find((item) => item.period_id === row.period_id && item.period === period)?.universe_units ?? 0;
    const units = num(row.units);
    return { period_id: row.period_id, period, dimension: scope.breakdown, key: row.bucket_key, label: row.bucket_label, ...(row.identity_status ? { identity_status: row.identity_status } : {}), units, share_of_universe: pct(units, universeUnits) };
  }) : null;
  let reconciled = true;
  if (breakdown) {
    for (const item of series) {
      const sum = breakdown.filter((row) => row.period_id === item.period_id && row.period === item.period).reduce((acc, row) => acc + row.units, 0);
      if (sum !== item.universe_units) reconciled = false;
    }
    if (!reconciled) warnings.push('RECONCILIATION_FAILED');
  }
  let comparison = null;
  if (scope.periods.length === 2) {
    const a = totals.period_a ?? 0; const b = totals.period_b ?? 0;
    comparison = { period_a_units: a, period_b_units: b, delta_units: b - a, delta_pct: a === 0 ? null : (b - a) / a, comparability: scope.comparability };
    if (a === 0) { comparison.reason = 'ZERO_BASE'; warnings.push('ZERO_BASE'); }
  }
  return {
    scope: { universe_definition: input.universe_definition ?? {}, breakdown: scope.breakdown, time_grain: scope.timeGrain },
    periods: scope.periods.map(({ id, period_kind, label, date_from, date_to }) => ({ id, period_kind, label, date_from, date_to })),
    series,
    ...(comparison ? { comparison } : {}),
    ...(breakdown ? { breakdown } : {}),
    coverage,
    validation: { reconciliation_status: reconciled ? 'OK' : 'RECONCILIATION_FAILED', response_truncated: responseTooLarge, max_breakdown_rows: MAX_BREAKDOWN_ROWS },
    warnings: [...new Set(warnings)],
  };
}

export async function buildMarketHistory(input = {}) {
  const scope = parseMarketHistoryInput(input);
  const query = buildMarketHistoryQuery(scope);
  const rows = await customGptDb().query(query.sql, query.params);
  if (rows.length !== 1) throw new Error('RVM market history query did not return one payload');
  return assembleMarketHistory(scope, rows[0], query.needsIdentity, input);
}
