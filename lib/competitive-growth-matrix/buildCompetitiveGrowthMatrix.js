import { customGptDb } from '../custom-gpt/db.js';
import { buildVentasUniverse } from '../ventas-universe/buildVentasUniverse.js';
import {
  buildPreliminarySnapshotInventoryQuery,
} from '../rvm-universe/buildRvmUniverse.js';
import { selectPreliminarySnapshot } from '../rvm-universe/selectPreliminarySnapshot.js';
import { parseGrowthMatrixInput } from './parseInput.js';
import {
  buildCurrentMtdRows, buildHistoricalRows, buildUnevaluableCurrentMtdRows,
  monthStart, shiftMonths, shiftYears,
} from './comparePeriods.js';
import { buildGrowthSeries, buildPreliminarySeries } from './buildSeries.js';
import { rankRows } from './rankRows.js';
import { fetchGrowthRvmUniverse } from './growthQuery.js';
import { commercialMonthForDate, commercialMonthRange } from '../ventas/commercialMonth.js';

function min(values) { return [...values].sort()[0]; }
function max(values) { return [...values].sort().at(-1); }

function historicalSourceStart(parsed) {
  const starts = [parsed.dateFrom];
  for (const comparison of parsed.temporalComparisons) {
    if (comparison === 'MOM') starts.push(monthStart(shiftMonths(parsed.dateFrom, -1)));
    if (comparison === 'YOY_MONTH') starts.push(monthStart(shiftMonths(parsed.dateFrom, -12)));
    if (comparison === 'ROLLING_12_YOY') starts.push(monthStart(shiftMonths(parsed.dateFrom, -23)));
    if (comparison === 'CALENDAR_YEAR_YOY' || comparison === 'YTD_YOY') {
      starts.push(`${Number(parsed.dateFrom.slice(0, 4)) - 1}-01-01`);
    }
  }
  if (parsed.includeCurrentMtd) starts.push(monthStart(shiftYears(parsed.cutoffDate, -1)));
  return min(starts);
}

function ventasSourceStart(parsed) {
  const starts = [];
  for (const comparison of parsed.temporalComparisons) {
    if (comparison === 'MOM') starts.push(commercialMonthRange(shiftMonths(parsed.dateFrom, -1)).start_date);
    if (comparison === 'YOY_MONTH') starts.push(commercialMonthRange(shiftMonths(parsed.dateFrom, -12)).start_date);
    if (comparison === 'ROLLING_12_YOY') starts.push(commercialMonthRange(shiftMonths(parsed.dateFrom, -23)).start_date);
    if (comparison === 'CALENDAR_YEAR_YOY' || comparison === 'YTD_YOY') {
      starts.push(`${Number(parsed.dateFrom.slice(0, 4)) - 1}-01-01`);
    }
  }
  if (parsed.includeCurrentMtd) {
    starts.push(commercialMonthRange(commercialMonthForDate(shiftYears(parsed.cutoffDate, -1))).start_date);
  }
  return min(starts.length ? starts : [parsed.dateFrom]);
}

function ventasHistoricalCutoff(parsed) {
  const monthly = parsed.temporalComparisons.some((comparison) =>
    ['MOM', 'YOY_MONTH', 'ROLLING_12_YOY'].includes(comparison));
  return monthly ? commercialMonthRange(parsed.dateTo.slice(0, 7)).end_date : parsed.dateTo;
}

async function loadBrandCatalog(query) {
  return query(`SELECT marca_id,nombre_canonico,origin_group
                FROM marcas_master_v01 ORDER BY marca_id`, []);
}

async function loadPreliminaryInventory(dateFrom, dateTo, query) {
  const built = buildPreliminarySnapshotInventoryQuery({ dateFrom, dateTo });
  return query(built.sql, built.params);
}

function periodTrace(ventasUniverse, rvmUniverse) {
  return {
    ventas_observed_through_date: ventasUniverse.period?.cutoff_date ?? null,
    rvm_observed_through_date: rvmUniverse.period?.last_observed_date ?? null,
  };
}

function validationFor(series, rows, rvmUniverse) {
  const forbidden = rows.some((row) => Object.keys(row).some((key) => /share/i.test(key)));
  const movements = new Set([
    'MARKET_UP__CIDEF_UP', 'MARKET_UP__CIDEF_DOWN', 'MARKET_UP__CIDEF_FLAT',
    'MARKET_DOWN__CIDEF_UP', 'MARKET_DOWN__CIDEF_DOWN', 'MARKET_DOWN__CIDEF_FLAT',
    'MARKET_FLAT__CIDEF_UP', 'MARKET_FLAT__CIDEF_DOWN', 'MARKET_FLAT__CIDEF_FLAT',
    'NOT_EVALUABLE',
  ]);
  const checks = {
    cidef_measure_is_ventas_company: true,
    benchmark_measure_is_rvm_registrations: true,
    cidef_independent_of_rvm_organization: true,
    historical_rvm_consolidated_only: rvmUniverse.data_status === 'CONSOLIDATED',
    cidef_origin_reconciles: series.coverage.cidef.origin.reconciles,
    benchmark_origin_reconciles: series.coverage.benchmark.origin.reconciles,
    cidef_brand_identity_reconciles: series.coverage.cidef.identity.brand_reconciles,
    cidef_model_identity_reconciles: series.coverage.cidef.identity.model_reconciles,
    benchmark_brand_identity_reconciles: series.coverage.benchmark.identity.brand_reconciles,
    benchmark_model_identity_reconciles: series.coverage.benchmark.identity.model_reconciles,
    cross_domain_ratio_absent: !forbidden,
    no_peer_counterpart_logic: true,
    grain_valid: rows.every((row) => (['TOTAL_MARKET', 'CHINESE_MARKET'].includes(row.comparison_scope)
      ? row.brand_id == null && row.model_id == null
      : row.comparison_scope === 'BRAND' ? row.brand_id != null && row.model_id == null
        : row.comparison_scope === 'MODEL' && row.brand_id != null && row.model_id != null)),
    movement_class_valid: rows.every((row) => movements.has(row.movement_class)),
    data_status_isolated: rows.every((row) => row.temporal_comparison === 'CURRENT_MTD'
      ? row.data_status.current === 'PRELIMINARY' && row.data_status.comparison === 'CONSOLIDATED'
      : row.data_status.current === 'CONSOLIDATED' && row.data_status.comparison === 'CONSOLIDATED'
        && row.snapshot_date == null),
  };
  return { ...checks, valid: Object.values(checks).every(Boolean) };
}

function warningsFor(series, currentWarning) {
  return [...new Set([
    ...(series.coverage.cidef.origin.UNKNOWN > 0 ? ['CIDEF_BRAND_ORIGIN_UNKNOWN_PRESENT'] : []),
    ...(series.coverage.benchmark.origin.UNKNOWN > 0 ? ['BENCHMARK_BRAND_ORIGIN_UNKNOWN_PRESENT'] : []),
    ...(series.coverage.cidef.identity.model_unresolved > 0 ? ['CIDEF_MODEL_IDENTITY_UNRESOLVED_PRESENT'] : []),
    ...(series.coverage.benchmark.identity.model_unresolved > 0 ? ['BENCHMARK_MODEL_IDENTITY_UNRESOLVED_PRESENT'] : []),
    ...(series.coverage.benchmark.identity.model_ambiguous > 0 ? ['BENCHMARK_MODEL_IDENTITY_AMBIGUOUS_PRESENT'] : []),
    ...(currentWarning ? [currentWarning] : []),
  ])];
}

export async function buildCompetitiveGrowthMatrix(input = {}, dependencies = {}) {
  const parsed = parseGrowthMatrixInput(input);
  const buildVentas = dependencies.buildVentasUniverse ?? buildVentasUniverse;
  const query = dependencies.query ?? customGptDb().query;
  const buildRvm = dependencies.buildRvmUniverse
    ?? ((rvmInput) => fetchGrowthRvmUniverse(rvmInput, query));
  const sourceStart = historicalSourceStart(parsed);
  const ventasStart = ventasSourceStart(parsed);
  const comparisonTo = parsed.includeCurrentMtd ? shiftYears(parsed.cutoffDate, -1) : parsed.dateTo;
  const consolidatedEnd = max([parsed.dateTo, comparisonTo]);
  const ventasCutoff = max([ventasHistoricalCutoff(parsed), parsed.cutoffDate].filter(Boolean));
  const [ventasUniverse, consolidatedRvm, brandRows] = await Promise.all([
    buildVentas({ cutoff_date: ventasCutoff, commercial_universe: 'COMPANY' }),
    buildRvm({
      date_from: sourceStart,
      date_to: consolidatedEnd,
      organization_scope: 'ALL',
      data_status: 'CONSOLIDATED',
    }),
    loadBrandCatalog(query),
  ]);
  const scopedVentasUniverse = {
    ...ventasUniverse,
    analytical_events: ventasUniverse.analytical_events.filter((event) => {
      const date = String(event.fecha_venta_iso || '').slice(0, 10);
      return date >= ventasStart && date <= ventasCutoff;
    }),
  };
  const series = buildGrowthSeries(scopedVentasUniverse, consolidatedRvm, brandRows, parsed);
  const trace = periodTrace(ventasUniverse, consolidatedRvm);
  const rows = buildHistoricalRows(series, parsed, trace);
  let currentWarning = null;
  let currentCoverage = null;

  if (parsed.includeCurrentMtd) {
    const currentFrom = monthStart(parsed.cutoffDate);
    const inventory = await loadPreliminaryInventory(currentFrom, parsed.cutoffDate, query);
    const selection = selectPreliminarySnapshot(inventory, {
      dateFrom: currentFrom,
      cutoffDate: parsed.cutoffDate,
    });
    if (!selection.selected) {
      currentWarning = selection.warning;
      rows.push(...buildUnevaluableCurrentMtdRows(series.entities, parsed, {
        cutoff_date: parsed.cutoffDate,
        data_status: { current: 'PRELIMINARY', comparison: 'CONSOLIDATED' },
        ...trace,
      }));
    } else {
      const preliminaryRvm = await buildRvm({
        date_from: currentFrom,
        date_to: parsed.cutoffDate,
        organization_scope: 'ALL',
        data_status: 'PRELIMINARY',
        snapshot_date: selection.selected.snapshot_date,
      });
      const preliminary = buildPreliminarySeries(preliminaryRvm, series.brandCatalog);
      const effectiveCutoff = min([
        parsed.cutoffDate,
        selection.selected.max_date,
        ventasUniverse.period?.cutoff_date,
        preliminaryRvm.period?.last_observed_date,
      ].filter(Boolean));
      if (!effectiveCutoff || effectiveCutoff < currentFrom) {
        currentWarning = 'INCOMPATIBLE_CURRENT_MTD_CUTOFF';
        rows.push(...buildUnevaluableCurrentMtdRows(series.entities, parsed, {
          cutoff_date: parsed.cutoffDate,
          data_status: { current: 'PRELIMINARY', comparison: 'CONSOLIDATED' },
          ...trace,
        }, 'NOT_EVALUABLE_INCOMPATIBLE_CUTOFF'));
      } else {
        const comparableTo = shiftYears(effectiveCutoff, -1);
        rows.push(...buildCurrentMtdRows(series, preliminary, parsed, effectiveCutoff, {
          cutoff_date: parsed.cutoffDate,
          effective_cutoff_date: effectiveCutoff,
          snapshot_date: selection.selected.snapshot_date,
          data_status: { current: 'PRELIMINARY', comparison: 'CONSOLIDATED' },
          current_days_observed: Number(effectiveCutoff.slice(8, 10)),
          comparison_days_observed: Number(comparableTo.slice(8, 10)),
          ventas_observed_through_date: ventasUniverse.period?.cutoff_date ?? null,
          rvm_observed_through_date: preliminaryRvm.period?.last_observed_date ?? null,
        }));
        currentCoverage = { benchmark: { origin: preliminary.origin, identity: preliminary.identity } };
      }
    }
  }

  const validation = validationFor(series, rows, consolidatedRvm);
  const warnings = warningsFor(series, currentWarning);
  const evaluable = rows.filter((row) => row.evaluation_status === 'EVALUABLE').length;
  return {
    engine: 'competitive_growth_matrix_v01',
    version: '0.1',
    status: !validation.valid || evaluable === 0 ? 'NOT_EVALUABLE' : warnings.length ? 'WARNING' : 'EVALUABLE',
    cidef_measure: 'VENTAS_COMPANY',
    benchmark_measure: 'RVM_REGISTRATIONS',
    grain: 'period × temporal_comparison × comparison_scope × optional brand_id × optional model_id',
    rows,
    rankings: rankRows(rows, parsed.rankings),
    coverage: { ...series.coverage, ...(currentCoverage ? { current_mtd: currentCoverage } : {}) },
    validation,
    warnings,
    metadata: {
      execution: 'ON_DEMAND',
      persistence: 'NONE',
      interpretation: 'DESCRIPTIVE_GROWTH_COMPARISON',
      cidef_source: 'ventas_universe_v01[commercial_universe=COMPANY]',
      benchmark_source: 'rvm_universe_v01[organization_scope=ALL]',
      chinese_market_authority: "marcas_master_v01.origin_group='CHINESE'",
      identity_authority: 'certified marca_id + modelo_id from existing MASTER aliases',
      ventas_month_authority: 'ventas_universe_v01 analytical_events.mes_venta (commercial day 02 through next calendar month day 01)',
      benchmark_month_authority: 'RVM calendar month',
      calendar_year_ytd_authority: 'calendar-date ranges; commercial month reassignment applies only to monthly aggregations',
      cross_domain_ratio_policy: 'FORBIDDEN',
      share_transfer_logic: 'OUT_OF_SCOPE',
    },
  };
}
