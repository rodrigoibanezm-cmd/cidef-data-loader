import { enumeratePeriods } from '../longitudinal/common.js';
import {
  commercialDateForDay,
  commercialDayForDate,
  commercialMonthDays,
  commercialMonthForDate,
  commercialMonthRange,
} from '../ventas/commercialMonth.js';

function iso(date) { return date.toISOString().slice(0, 10); }

export function shiftMonths(value, amount) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return iso(date).slice(0, 7);
}

export function shiftYears(value, amount) {
  const source = new Date(`${value}T00:00:00.000Z`);
  const year = source.getUTCFullYear() + amount;
  const month = source.getUTCMonth();
  const day = Math.min(source.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return iso(new Date(Date.UTC(year, month, day)));
}

export const monthStart = (value) => `${value.slice(0, 7)}-01`;

export function monthEnd(value) {
  const date = new Date(`${monthStart(value)}T00:00:00.000Z`);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

function monthsBetween(from, to) {
  return enumeratePeriods(monthStart(from), monthEnd(to), 'MONTH');
}

function hasMonth(index, month) {
  return index.minPeriod != null && month >= index.minPeriod && month <= index.maxPeriod;
}

function monthly(index, key, month) {
  if (!hasMonth(index, month)) return null;
  return index.series.get(key)?.months.get(month) ?? 0;
}

function rolling(index, key, endMonth, length = 12) {
  const months = [...Array(length).keys()].map((_, offset) => shiftMonths(endMonth, -offset));
  if (months.some((month) => !hasMonth(index, month))) return null;
  return months.reduce((sum, month) => sum + (index.series.get(key)?.months.get(month) ?? 0), 0);
}

function range(index, key, from, to) {
  if (index.minDate == null || from.slice(0, 7) < index.minDate.slice(0, 7)
    || to.slice(0, 7) > index.maxDate.slice(0, 7)) return null;
  let sum = 0;
  for (const [date, units] of index.series.get(key)?.days ?? []) {
    if (date >= from && date <= to) sum += units;
  }
  return sum;
}

function metric(current, previous, unavailableStatus = 'NOT_EVALUABLE_MISSING_PERIOD') {
  if (current == null || previous == null) {
    return { current, previous, abs: null, pct: null, pctStatus: unavailableStatus, direction: 'NOT_EVALUABLE' };
  }
  const abs = current - previous;
  return {
    current,
    previous,
    abs,
    pct: previous === 0 ? null : (100 * abs) / previous,
    pctStatus: previous === 0 ? 'NOT_EVALUABLE_ZERO_BASE' : 'EVALUABLE',
    direction: abs > 0 ? 'UP' : abs < 0 ? 'DOWN' : 'FLAT',
  };
}

function differential(cidef, benchmark) {
  if (cidef.pctStatus === 'EVALUABLE' && benchmark.pctStatus === 'EVALUABLE') {
    return { value: cidef.pct - benchmark.pct, status: 'EVALUABLE' };
  }
  const statuses = [cidef.pctStatus, benchmark.pctStatus];
  const status = statuses.includes('NOT_EVALUABLE_NO_COMPATIBLE_SNAPSHOT')
    ? 'NOT_EVALUABLE_NO_COMPATIBLE_SNAPSHOT'
    : statuses.includes('NOT_EVALUABLE_PRE_LAUNCH') ? 'NOT_EVALUABLE_PRE_LAUNCH'
      : statuses.includes('NOT_EVALUABLE_INCOMPATIBLE_CUTOFF') ? 'NOT_EVALUABLE_INCOMPATIBLE_CUTOFF'
        : statuses.includes('NOT_EVALUABLE_MISSING_PERIOD') ? 'NOT_EVALUABLE_MISSING_PERIOD'
          : 'NOT_EVALUABLE_ZERO_BASE';
  return { value: null, status };
}

function movement(cidef, benchmark) {
  if (cidef.direction === 'NOT_EVALUABLE' || benchmark.direction === 'NOT_EVALUABLE') return 'NOT_EVALUABLE';
  return `MARKET_${benchmark.direction}__CIDEF_${cidef.direction}`;
}

function rowFor(entity, temporalComparison, period, comparisonPeriod, cidefValues, benchmarkValues, trace = {}) {
  const evaluationEndPeriod = cidefValues.periodEnd ?? period.slice(0, 7);
  const preLaunch = entity.comparison_scope === 'MODEL' && entity.first_observed_period != null
    && evaluationEndPeriod < entity.first_observed_period;
  const unavailableStatus = preLaunch ? 'NOT_EVALUABLE_PRE_LAUNCH'
    : trace.unavailable_status ?? 'NOT_EVALUABLE_MISSING_PERIOD';
  const cidef = preLaunch ? metric(null, null, unavailableStatus)
    : metric(cidefValues.current, cidefValues.previous, unavailableStatus);
  const benchmark = preLaunch ? metric(null, null, unavailableStatus)
    : metric(benchmarkValues.current, benchmarkValues.previous, unavailableStatus);
  const relative = differential(cidef, benchmark);
  return {
    period,
    comparison_period: comparisonPeriod,
    temporal_comparison: temporalComparison,
    comparison_scope: entity.comparison_scope,
    brand_id: entity.brand_id,
    brand_name: entity.brand_name ?? null,
    model_id: entity.model_id,
    model_name: entity.model_name ?? null,
    first_observed_period: entity.first_observed_period,
    evaluation_status: cidef.direction !== 'NOT_EVALUABLE' && benchmark.direction !== 'NOT_EVALUABLE'
      ? 'EVALUABLE' : unavailableStatus,
    cutoff_date: trace.cutoff_date ?? null,
    effective_cutoff_date: trace.effective_cutoff_date ?? null,
    snapshot_date: trace.snapshot_date ?? null,
    data_status: trace.data_status ?? { current: 'CONSOLIDATED', comparison: 'CONSOLIDATED' },
    current_days_observed: trace.current_days_observed ?? null,
    comparison_days_observed: trace.comparison_days_observed ?? null,
    ventas_observed_through_date: trace.ventas_observed_through_date ?? null,
    rvm_observed_through_date: trace.rvm_observed_through_date ?? null,
    cidef_vin_current: cidef.current,
    cidef_vin_previous: cidef.previous,
    cidef_growth_abs: cidef.abs,
    cidef_growth_pct: cidef.pct,
    cidef_growth_pct_status: cidef.pctStatus,
    cidef_direction: cidef.direction,
    benchmark_vin_current: benchmark.current,
    benchmark_vin_previous: benchmark.previous,
    benchmark_growth_abs: benchmark.abs,
    benchmark_growth_pct: benchmark.pct,
    benchmark_growth_pct_status: benchmark.pctStatus,
    benchmark_direction: benchmark.direction,
    growth_differential_pp: relative.value,
    growth_differential_status: relative.status,
    movement_class: movement(cidef, benchmark),
  };
}

function historicalValues(index, key, period, comparison) {
  if (comparison === 'YOY_MONTH') return {
    current: monthly(index, key, period), previous: monthly(index, key, shiftMonths(period, -12)),
  };
  if (comparison === 'MOM') return {
    current: monthly(index, key, period), previous: monthly(index, key, shiftMonths(period, -1)),
  };
  if (comparison === 'ROLLING_12_YOY') return {
    current: rolling(index, key, period), previous: rolling(index, key, shiftMonths(period, -12)),
  };
  if (comparison === 'CALENDAR_YEAR_YOY') return {
    current: range(index, key, `${period}-01-01`, `${period}-12-31`),
    previous: range(index, key, `${Number(period) - 1}-01-01`, `${Number(period) - 1}-12-31`),
  };
  throw new Error('unsupported historical comparison');
}

export function buildHistoricalRows(series, parsed, trace = {}) {
  const rows = [];
  for (const comparison of parsed.temporalComparisons) {
    if (comparison === 'YTD_YOY') {
      const year = parsed.dateTo.slice(0, 4);
      const previousTo = shiftYears(parsed.dateTo, -1);
      for (const entity of series.entities) {
        rows.push(rowFor(entity, comparison, `${year}-YTD`, `${Number(year) - 1}-YTD`, {
          current: range(series.cidef, entity.key, `${year}-01-01`, parsed.dateTo),
          previous: range(series.cidef, entity.key, `${Number(year) - 1}-01-01`, previousTo),
          periodEnd: parsed.dateTo.slice(0, 7),
        }, {
          current: range(series.benchmark, entity.key, `${year}-01-01`, parsed.dateTo),
          previous: range(series.benchmark, entity.key, `${Number(year) - 1}-01-01`, previousTo),
        }, trace));
      }
      continue;
    }
    const periods = comparison === 'CALENDAR_YEAR_YOY'
      ? enumeratePeriods(parsed.dateFrom, parsed.dateTo, 'YEAR')
      : monthsBetween(parsed.dateFrom, parsed.dateTo);
    for (const period of periods) {
      const previousPeriod = comparison === 'MOM' ? shiftMonths(period, -1)
        : comparison === 'CALENDAR_YEAR_YOY' ? String(Number(period) - 1) : shiftMonths(period, -12);
      for (const entity of series.entities) {
        rows.push(rowFor(entity, comparison, period, previousPeriod,
          { ...historicalValues(series.cidef, entity.key, period, comparison),
            periodEnd: comparison === 'CALENDAR_YEAR_YOY' ? `${period}-12` : period },
          historicalValues(series.benchmark, entity.key, period, comparison), trace));
      }
    }
  }
  return rows;
}

export function buildCurrentMtdRows(series, preliminary, parsed, effectiveCutoff, trace = {}) {
  const period = effectiveCutoff.slice(0, 7);
  const comparisonTo = shiftYears(effectiveCutoff, -1);
  const cidefPeriod = commercialMonthForDate(effectiveCutoff);
  const cidefComparisonPeriod = shiftMonths(cidefPeriod, -12);
  const comparisonCommercialDay = Math.min(
    commercialDayForDate(effectiveCutoff),
    commercialMonthDays(cidefComparisonPeriod),
  );
  const cidefComparisonTo = commercialDateForDay(cidefComparisonPeriod, comparisonCommercialDay);
  return series.entities.map((entity) => rowFor(entity, 'CURRENT_MTD', period, comparisonTo.slice(0, 7), {
    current: range(series.cidef, entity.key, commercialMonthRange(cidefPeriod).start_date, effectiveCutoff),
    previous: range(series.cidef, entity.key, commercialMonthRange(cidefComparisonPeriod).start_date, cidefComparisonTo),
    periodEnd: cidefPeriod,
  }, {
    current: range(preliminary, entity.key, monthStart(effectiveCutoff), effectiveCutoff),
    previous: range(series.benchmark, entity.key, monthStart(comparisonTo), comparisonTo),
  }, trace));
}

export function buildUnevaluableCurrentMtdRows(entities, parsed, trace = {}, unavailableStatus = 'NOT_EVALUABLE_NO_COMPATIBLE_SNAPSHOT') {
  const period = parsed.cutoffDate.slice(0, 7);
  return entities.map((entity) => rowFor(entity, 'CURRENT_MTD', period, shiftYears(parsed.cutoffDate, -1).slice(0, 7),
    { current: null, previous: null }, { current: null, previous: null }, {
      ...trace, unavailable_status: unavailableStatus,
    }));
}
