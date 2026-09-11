import { buildDailySnapshots } from '../daily-close-backtest/buildDailySnapshots.js';
import { buildRecognitionEvents } from '../daily-close-backtest/buildRecognitionEvents.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import { loadVentasRows } from '../ventas/loadVentasRows.js';
import { buildHistoryRows } from '../intramonth-sales-history/buildHistoryRows.js';
import { buildMilestoneSummary } from '../intramonth-sales-history/buildMilestoneSummary.js';
import { filterObservableRows } from '../intramonth-sales-history/filterObservableRows.js';
import { parseHistoryRange } from '../intramonth-sales-history/historyRange.js';
import { validateHistory } from '../intramonth-sales-history/validateHistory.js';

export const ENGINE_NAME = 'intramonth_sales_history_context_v01';
export const ENGINE_VERSION = '0.1';

function ratio(numerator, denominator) {
  if (!(denominator > 0)) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

function closingFactor(finalVin, accumulatedVin) {
  if (!(accumulatedVin > 0)) return null;
  const value = finalVin / accumulatedVin;
  return Number.isFinite(value) ? value : null;
}

function buildMonthlyMilestones(cidefDaily, range) {
  const byMonth = new Map();
  for (const row of cidefDaily || []) {
    if (!byMonth.has(row.target_month)) byMonth.set(row.target_month, []);
    byMonth.get(row.target_month).push(row);
  }

  const monthly = [];
  const evaluationExclusions = [];

  for (const month of range.months) {
    const rows = (byMonth.get(month) || []).sort((a, b) => a.day_of_month - b.day_of_month);
    const isClosed = month < range.currentMonth;
    if (!isClosed) {
      evaluationExclusions.push({ month, reason: 'OPEN_COMMERCIAL_MONTH' });
      continue;
    }

    const finalRow = rows.at(-1) ?? null;
    const finalVin = finalRow?.actual_close ?? null;
    const result = {
      month,
      final_vin: finalVin,
      evaluable: finalVin > 0,
    };

    for (const day of range.milestoneDays) {
      const milestone = rows.find((row) => Number(row.day_of_month) === day) ?? null;
      const accumulated = milestone?.accumulated_sales ?? null;
      result[`vin_d${day}`] = accumulated;
      result[`ratio_d${day}`] = accumulated == null ? null : ratio(accumulated, finalVin);
      result[`factor_close_d${day}`] = accumulated == null ? null : closingFactor(finalVin, accumulated);
    }

    if (!(finalVin > 0)) {
      evaluationExclusions.push({ month, reason: finalVin === 0 ? 'ZERO_FINAL_VIN' : 'FINAL_VIN_UNAVAILABLE' });
    }
    monthly.push(result);
  }

  return { monthly, evaluationExclusions };
}

function validateMonthlyMilestones(monthly, milestoneDays) {
  const milestoneNeverExceedsClose = monthly.every((row) => milestoneDays.every((day) => {
    const value = row[`vin_d${day}`];
    return value == null || row.final_vin == null || value <= row.final_vin;
  }));
  const ratiosBounded = monthly.every((row) => milestoneDays.every((day) => {
    const value = row[`ratio_d${day}`];
    return value == null || (value >= 0 && value <= 1);
  }));
  return { milestone_never_exceeds_close: milestoneNeverExceedsClose, ratios_bounded_0_1: ratiosBounded };
}

export function calculateIntramonthSalesHistoryContext(
  rows,
  identityMaps,
  input,
  now = new Date(),
) {
  const range = parseHistoryRange(input, now);
  const observableRows = filterObservableRows(rows, range.observableThrough);
  const timeline = buildRecognitionEvents(observableRows, range.startMonth, range.endMonth);
  const snapshots = buildDailySnapshots(timeline.events, identityMaps, range.months);
  const built = buildHistoryRows(snapshots, range);
  const checked = validateHistory(built, range);

  const common = {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    inputs: {
      start_month: range.startMonth,
      end_month: range.endMonth,
      output_mode: range.outputMode,
      milestone_days: range.milestoneDays,
      ...(range.percentiles === null ? {} : { percentiles: range.percentiles }),
    },
    policy: {
      recognition: 'cutoff-safe LAST-by-VIN; temporal evidence is filtered before recognition',
      organization_scope: "resolved historical stores with tipo_canal='CIDEF'",
      commercial_universe: 'CIDEF_OWN_STORES_BY_HISTORICAL_STORE_IDENTITY',
      commercial_calendar: 'commercial month starts on calendar day 2 and ends on calendar day 1 of the following month',
      completion_criterion: 'target_month is before the current America/Santiago commercial month',
      store_zero_semantics: 'SPARSE_POSITIVE; absent store row is not zero',
      label_semantics: 'actual_close is LABEL_RETROSPECTIVE; null for open target month',
      future_dates: 'open month emits only dates observable in America/Santiago',
    },
    variables: {
      historical_evaluation: [
        'month',
        'final_vin',
        'commercial_day',
        'accumulated_vin_at_day',
        'ratio_accumulated_to_close',
        'factor_close_to_accumulated',
      ],
      existing_close_forecast: [
        'observed_to_date',
        'day_of_month',
        'learned_completion',
        'training_observations',
        'training_months',
      ],
      existing_predictability_evaluation: [
        'day_of_month',
        'median_ape_pct',
        'p90_ape_pct',
        'targets_evaluable',
      ],
    },
  };

  if (range.outputMode === 'DAILY') {
    return {
      ...common,
      status: checked.ok ? 'ok' : 'warning',
      policy: {
        ...common.policy,
        output_grain: 'target_month + cutoff_date; store detail target_month + cutoff_date + sucursal_id',
        analytics: 'daily compatibility mode; no ratios, trajectory benchmarks, forecasts, thresholds or alerts',
      },
      coverage: {
        source_rows: (rows || []).length,
        observable_source_rows: observableRows.length,
        months_requested: range.months.length,
        cidef_daily_rows: built.cidefDaily.length,
        store_daily_rows: built.storeDaily.length,
        tie_groups_resolved: timeline.tie_groups_resolved,
        daily: built.dailyCoverage,
      },
      validation: {
        no_post_cutoff_evidence_used: true,
        ...checked.validations,
      },
      warnings: checked.ok ? [] : ['One or more intramonth history validations failed'],
      cidef_daily: built.cidefDaily,
      store_daily: built.storeDaily,
    };
  }

  const compact = buildMonthlyMilestones(built.cidefDaily, range);
  const summaryByMilestone = buildMilestoneSummary(compact.monthly, range.milestoneDays, range.percentiles);
  const compactValidation = validateMonthlyMilestones(compact.monthly, range.milestoneDays);
  const validation = {
    no_post_cutoff_evidence_used: true,
    closed_month_end_equals_label: checked.validations.closed_month_end_equals_label,
    coverage_reconciles: checked.validations.coverage_reconciles,
    ...compactValidation,
  };
  const ok = Object.values(validation).every(Boolean);

  return {
    ...common,
    status: ok ? 'ok' : 'warning',
    policy: {
      ...common.policy,
      output_grain: 'one row per closed commercial month',
      analytics: 'monthly milestone context exposes completion ratios, inverse closing factors and deterministic milestone summaries; it does not produce a forecast',
    },
    coverage: {
      source_rows: (rows || []).length,
      observable_source_rows: observableRows.length,
      months_requested: range.months.length,
      months_returned: compact.monthly.length,
      months_evaluable: compact.monthly.filter((row) => row.evaluable).length,
      months_not_evaluable: compact.evaluationExclusions.length,
      tie_groups_resolved: timeline.tie_groups_resolved,
    },
    validation,
    warnings: ok ? [] : ['One or more intramonth monthly milestone validations failed'],
    evaluation_exclusions: compact.evaluationExclusions,
    monthly: compact.monthly,
    summary_by_milestone: summaryByMilestone,
  };
}

export async function intramonthSalesHistoryContextV01(input = {}) {
  const [rows, identityMaps] = await Promise.all([
    loadVentasRows(),
    loadOrganizationalIdentityMaps(),
  ]);
  return calculateIntramonthSalesHistoryContext(rows, identityMaps, input);
}
