import { buildDailySnapshots } from '../daily-close-backtest/buildDailySnapshots.js';
import { buildRecognitionEvents } from '../daily-close-backtest/buildRecognitionEvents.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import { loadVentasRows } from '../ventas/loadVentasRows.js';
import { buildHistoryRows } from '../intramonth-sales-history/buildHistoryRows.js';
import { filterObservableRows } from '../intramonth-sales-history/filterObservableRows.js';
import { parseHistoryRange } from '../intramonth-sales-history/historyRange.js';
import { validateHistory } from '../intramonth-sales-history/validateHistory.js';

export const ENGINE_NAME = 'intramonth_sales_history_context_v01';
export const ENGINE_VERSION = '0.1';

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

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: checked.ok ? 'ok' : 'warning',
    inputs: { start_month: range.startMonth, end_month: range.endMonth },
    policy: {
      recognition: 'cutoff-safe LAST-by-VIN; temporal evidence is filtered before recognition',
      organization_scope: "resolved historical stores with tipo_canal='CIDEF'",
      company_grain: 'target_month + cutoff_date',
      store_grain: 'target_month + cutoff_date + sucursal_id',
      store_zero_semantics: 'SPARSE_POSITIVE; absent store row is not zero',
      label_semantics: 'actual_close is LABEL_RETROSPECTIVE; null for open target month',
      future_dates: 'open month emits only dates observable in America/Santiago',
      analytics: 'context only; no ratios, trajectory benchmarks, forecasts, thresholds or alerts',
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

export async function intramonthSalesHistoryContextV01(input = {}) {
  const [rows, identityMaps] = await Promise.all([
    loadVentasRows(),
    loadOrganizationalIdentityMaps(),
  ]);
  return calculateIntramonthSalesHistoryContext(rows, identityMaps, input);
}
