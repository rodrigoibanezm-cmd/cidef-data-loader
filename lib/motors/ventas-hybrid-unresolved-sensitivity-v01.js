import { neon } from '@neondatabase/serverless';
import { parseFechaFactura } from './ventas-monthly-dedup-sensitivity-v01.js';

export const ENGINE_NAME = 'ventas_hybrid_unresolved_sensitivity_v01';
export const ENGINE_VERSION = '0.1';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_START_MONTH = '2021-01';
const DEFAULT_END_MONTH = '2026-07';
const DEFAULT_DOMINANT_FIRST_CUSTOMERS = Object.freeze(['77050575', '96800910', '96726670']);

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function normalizeMonth(value, fallback, name) {
  const month = String(value || fallback);
  if (!MONTH_RE.test(month)) throw new Error(`${name} must use YYYY-MM`);
  return month;
}

function monthOrdinal(month) {
  const [year, m] = month.split('-').map(Number);
  return year * 12 + m - 1;
}

function inWindow(month, startMonth, endMonth) {
  const value = monthOrdinal(month);
  return value >= monthOrdinal(startMonth) && value <= monthOrdinal(endMonth);
}

function monthRange(startMonth, endMonth) {
  const start = monthOrdinal(startMonth);
  const end = monthOrdinal(endMonth);
  if (end < start) throw new Error('end_month must be >= start_month');
  const months = [];
  for (let cursor = start; cursor <= end; cursor += 1) {
    const year = Math.floor(cursor / 12);
    const month = (cursor % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

function normalizedVin(value) {
  if (value == null) return null;
  const vin = String(value).trim();
  return vin === '' ? null : vin;
}

function normalizedText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function stableId(value) {
  if (value == null) return '';
  return String(value);
}

function compareStableId(a, b) {
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return String(a).localeCompare(String(b));
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sumMap(map) {
  return [...map.values()].reduce((sum, value) => sum + value, 0);
}

function yoy(current, prior) {
  if (prior == null || prior === 0) return null;
  return current / prior - 1;
}

function trueSignChanged(a, b) {
  if (a == null || b == null) return false;
  return (a < 0 && b > 0) || (a > 0 && b < 0);
}

function normalizeDominantCustomers(value) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_DOMINANT_FIRST_CUSTOMERS;
  const normalized = [...new Set(source.map(normalizedText).filter(Boolean))];
  if (!normalized.length) throw new Error('dominant_first_customers must contain at least one non-empty customer');
  return normalized;
}

export function calculateVentasHybridUnresolvedSensitivity(rows, input = {}) {
  const startMonth = normalizeMonth(input.start_month, DEFAULT_START_MONTH, 'start_month');
  const endMonth = normalizeMonth(input.end_month, DEFAULT_END_MONTH, 'end_month');
  const requestedMonths = monthRange(startMonth, endMonth);
  const dominantCustomers = normalizeDominantCustomers(input.dominant_first_customers);
  const dominantSet = new Set(dominantCustomers);

  const byVin = new Map();
  const nullVinCounts = new Map();
  let sourceRows = 0;
  let nullVinRows = 0;
  let assignableNullVinRows = 0;
  let unassignableNullVinRows = 0;
  let parseErrors = 0;
  let nullFechaRows = 0;

  for (const row of rows) {
    sourceRows += 1;
    const vin = normalizedVin(row.nro_vin_chasis);
    const parsed = parseFechaFactura(row.fecha_factura);

    if (vin == null) {
      nullVinRows += 1;
      if (parsed == null) {
        nullFechaRows += 1;
        unassignableNullVinRows += 1;
      } else if (parsed.error) {
        parseErrors += 1;
        unassignableNullVinRows += 1;
      } else {
        assignableNullVinRows += 1;
        increment(nullVinCounts, parsed.month);
      }
      continue;
    }

    if (!byVin.has(vin)) byVin.set(vin, { rows: [], dateError: false });
    const entry = byVin.get(vin);
    if (parsed == null) {
      nullFechaRows += 1;
      entry.dateError = true;
      continue;
    }
    if (parsed.error) {
      parseErrors += 1;
      entry.dateError = true;
      continue;
    }
    entry.rows.push({ ...row, __parsed: parsed, __id: stableId(row.id) });
  }

  const scenarioA = new Map(nullVinCounts);
  const scenarioB = new Map(nullVinCounts);
  const unresolvedTransfers = new Map();

  let excludedVinsWithDateErrors = 0;
  let assignableNonNullVins = 0;
  let nonCrossMonthVins = 0;
  let crossMonthVins = 0;
  let resolvedCrossMonthVins = 0;
  let unresolvedCrossMonthVins = 0;
  let unresolvedWindowVins = 0;
  let firstTieVins = 0;
  let lastTieVins = 0;
  let anyExtremeTieVins = 0;
  let unresolvedFirstOutsideWindow = 0;
  let unresolvedLastOutsideWindow = 0;

  for (const entry of byVin.values()) {
    if (entry.dateError || !entry.rows.length) {
      excludedVinsWithDateErrors += 1;
      continue;
    }

    const vinRows = entry.rows.slice().sort((a, b) => a.__parsed.date - b.__parsed.date || compareStableId(a.__id, b.__id));
    const firstDate = vinRows[0].__parsed.date.getTime();
    const lastDate = vinRows[vinRows.length - 1].__parsed.date.getTime();
    const firstCandidates = vinRows.filter((row) => row.__parsed.date.getTime() === firstDate);
    const lastCandidates = vinRows.filter((row) => row.__parsed.date.getTime() === lastDate);
    const firstTie = firstCandidates.length > 1;
    const lastTie = lastCandidates.length > 1;
    const first = firstCandidates.slice().sort((a, b) => compareStableId(a.__id, b.__id))[0];
    const last = lastCandidates.slice().sort((a, b) => compareStableId(a.__id, b.__id))[0];
    const firstMonth = first.__parsed.month;
    const lastMonth = last.__parsed.month;
    const firstCustomer = normalizedText(first.cliente);

    assignableNonNullVins += 1;

    if (firstMonth === lastMonth) {
      nonCrossMonthVins += 1;
      increment(scenarioA, firstMonth);
      increment(scenarioB, firstMonth);
      continue;
    }

    crossMonthVins += 1;
    if (firstTie) firstTieVins += 1;
    if (lastTie) lastTieVins += 1;
    if (firstTie || lastTie) anyExtremeTieVins += 1;

    if (dominantSet.has(firstCustomer)) {
      resolvedCrossMonthVins += 1;
      increment(scenarioA, lastMonth);
      increment(scenarioB, lastMonth);
      continue;
    }

    unresolvedCrossMonthVins += 1;
    increment(scenarioA, firstMonth);
    increment(scenarioB, lastMonth);
    increment(unresolvedTransfers, `${firstMonth}|${lastMonth}`);
    if (inWindow(firstMonth, startMonth, endMonth) || inWindow(lastMonth, startMonth, endMonth)) unresolvedWindowVins += 1;
    if (!inWindow(firstMonth, startMonth, endMonth)) unresolvedFirstOutsideWindow += 1;
    if (!inWindow(lastMonth, startMonth, endMonth)) unresolvedLastOutsideWindow += 1;
  }

  const monthly = requestedMonths.map((month) => {
    const a = scenarioA.get(month) || 0;
    const b = scenarioB.get(month) || 0;
    const deltaSigned = b - a;
    const deltaAbs = Math.abs(deltaSigned);
    const [year, monthNumber] = month.split('-').map(Number);
    const priorMonth = `${year - 1}-${String(monthNumber).padStart(2, '0')}`;
    const priorA = scenarioA.get(priorMonth);
    const priorB = scenarioB.get(priorMonth);
    const yoyA = yoy(a, priorA);
    const yoyB = yoy(b, priorB);
    return {
      month,
      scenario_a: a,
      scenario_b: b,
      delta_signed: deltaSigned,
      delta_abs: deltaAbs,
      delta_pct: a === 0 ? null : deltaSigned / a,
      delta_pct_abs: a === 0 ? null : deltaAbs / a,
      yoy_a: yoyA,
      yoy_b: yoyB,
      yoy_delta: yoyA == null || yoyB == null ? null : yoyB - yoyA,
      yoy_sign_changed: trueSignChanged(yoyA, yoyB),
    };
  });

  const maxAbsDelta = monthly.reduce((best, row) => (!best || row.delta_abs > best.delta_abs ? row : best), null);
  const maxPctDelta = monthly.reduce((best, row) => row.delta_pct_abs != null && (!best || row.delta_pct_abs > best.delta_pct_abs) ? row : best, null);
  const monthsAbsPctGt1 = monthly.filter((row) => row.delta_pct_abs != null && row.delta_pct_abs > 0.01).map((row) => row.month);
  const monthsAbsPctGt2 = monthly.filter((row) => row.delta_pct_abs != null && row.delta_pct_abs > 0.02).map((row) => row.month);
  const yoySignChangeMonths = monthly.filter((row) => row.yoy_sign_changed).map((row) => row.month);

  const unresolvedMonthTransfers = [...unresolvedTransfers.entries()]
    .map(([key, vinCount]) => {
      const [fromMonth, toMonth] = key.split('|');
      return {
        from_month: fromMonth,
        to_month: toMonth,
        vin_count: vinCount,
        first_in_window: inWindow(fromMonth, startMonth, endMonth),
        last_in_window: inWindow(toMonth, startMonth, endMonth),
      };
    })
    .sort((a, b) => b.vin_count - a.vin_count || a.from_month.localeCompare(b.from_month) || a.to_month.localeCompare(b.to_month));

  const recognizedGlobalA = sumMap(scenarioA);
  const recognizedGlobalB = sumMap(scenarioB);
  const recognizedWindowA = monthly.reduce((sum, row) => sum + row.scenario_a, 0);
  const recognizedWindowB = monthly.reduce((sum, row) => sum + row.scenario_b, 0);
  const unresolvedTransferUnits = unresolvedMonthTransfers.reduce((sum, row) => sum + row.vin_count, 0);
  const expectedAssignableUnits = assignableNonNullVins + assignableNullVinRows;

  const validations = {
    cross_partition_ok: resolvedCrossMonthVins + unresolvedCrossMonthVins === crossMonthVins,
    unresolved_transfer_sum: unresolvedTransferUnits,
    unresolved_transfer_sum_matches: unresolvedTransferUnits === unresolvedCrossMonthVins,
    recognized_global_totals_match: recognizedGlobalA === recognizedGlobalB,
    scenario_a_matches_expected_assignable_units: recognizedGlobalA === expectedAssignableUnits,
    scenario_b_matches_expected_assignable_units: recognizedGlobalB === expectedAssignableUnits,
  };

  const warnings = [];
  if (parseErrors) warnings.push(`${parseErrors} rows have unparseable fecha_factura`);
  if (nullFechaRows) warnings.push(`${nullFechaRows} rows have null/blank fecha_factura`);
  if (excludedVinsWithDateErrors) warnings.push(`${excludedVinsWithDateErrors} non-null VINs have at least one invalid/missing fecha_factura and were excluded from both scenarios`);
  if (unassignableNullVinRows) warnings.push(`${unassignableNullVinRows} null-VIN rows could not be assigned to a month`);
  if (anyExtremeTieVins) warnings.push(`${anyExtremeTieVins} cross-month VINs have multiple rows on FIRST and/or LAST extreme date; lowest id is used only as stable technical tie-break`);
  if (!Object.values(validations).every((value) => value === true || typeof value === 'number')) warnings.push('One or more reconciliation validations failed');

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: warnings.length ? 'warning' : 'ok',
    inputs: {
      start_month: startMonth,
      end_month: endMonth,
      dominant_first_customers: dominantCustomers,
    },
    policy: {
      first_last_scope: 'global snapshot',
      window_application: 'after global FIRST/LAST classification',
      non_cross_month: 'same month in A and B',
      resolved_cross_month: 'LAST in A and B when FIRST cliente is in dominant_first_customers',
      unresolved_cross_month: 'FIRST in A; LAST in B',
      null_vin: 'one unit per parseable row in both scenarios',
      extreme_tie_breaker: 'lowest stable id on exact extreme fecha_factura; technical only, not a business rule',
    },
    coverage: {
      source_rows: sourceRows,
      distinct_non_null_vins: byVin.size,
      null_vin_rows: nullVinRows,
      assignable_null_vin_rows: assignableNullVinRows,
      unassignable_null_vin_rows: unassignableNullVinRows,
      parse_errors: parseErrors,
      null_fecha_factura_rows: nullFechaRows,
      excluded_vins_with_date_errors: excludedVinsWithDateErrors,
      assignable_non_null_vins: assignableNonNullVins,
      non_cross_month_vins: nonCrossMonthVins,
      cross_month_vins: crossMonthVins,
      resolved_cross_month_vins: resolvedCrossMonthVins,
      unresolved_cross_month_vins: unresolvedCrossMonthVins,
      unresolved_window_vins: unresolvedWindowVins,
      unresolved_first_outside_window_vins: unresolvedFirstOutsideWindow,
      unresolved_last_outside_window_vins: unresolvedLastOutsideWindow,
      first_extreme_tie_vins: firstTieVins,
      last_extreme_tie_vins: lastTieVins,
      any_extreme_tie_vins: anyExtremeTieVins,
    },
    unresolved_vins: unresolvedCrossMonthVins,
    unresolved_pct_cross_month: crossMonthVins ? unresolvedCrossMonthVins / crossMonthVins : null,
    unresolved_month_transfers: unresolvedMonthTransfers,
    monthly,
    max_abs_delta: {
      month: maxAbsDelta?.month ?? null,
      value: maxAbsDelta?.delta_abs ?? null,
    },
    max_pct_delta: {
      month: maxPctDelta?.month ?? null,
      value: maxPctDelta?.delta_pct_abs ?? null,
    },
    months_abs_pct_gt_1: monthsAbsPctGt1,
    months_abs_pct_gt_2: monthsAbsPctGt2,
    yoy_sign_change_months: yoySignChangeMonths,
    reconciliation: {
      recognized_global_a: recognizedGlobalA,
      recognized_global_b: recognizedGlobalB,
      recognized_window_a: recognizedWindowA,
      recognized_window_b: recognizedWindowB,
      unresolved_first_units: unresolvedCrossMonthVins,
      unresolved_last_units: unresolvedCrossMonthVins,
      net_global_difference: recognizedGlobalB - recognizedGlobalA,
      net_window_difference: recognizedWindowB - recognizedWindowA,
      expected_assignable_units: expectedAssignableUnits,
    },
    validation: validations,
    warnings,
  };
}

export async function ventasHybridUnresolvedSensitivityV01(input = {}) {
  const sql = db();
  const rows = await sql.query(`
    SELECT
      id,
      nro_vin_chasis,
      fecha_factura,
      cliente
    FROM ventas_raw
  `);
  return calculateVentasHybridUnresolvedSensitivity(rows, input);
}
