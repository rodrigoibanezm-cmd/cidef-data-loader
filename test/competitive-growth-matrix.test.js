import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCompetitiveGrowthMatrix } from '../lib/competitive-growth-matrix/buildCompetitiveGrowthMatrix.js';
import { buildGrowthSeries, buildPreliminarySeries } from '../lib/competitive-growth-matrix/buildSeries.js';
import { buildGrowthRvmQuery } from '../lib/competitive-growth-matrix/growthQuery.js';
import { buildCurrentMtdRows, buildHistoricalRows } from '../lib/competitive-growth-matrix/comparePeriods.js';
import { parseGrowthMatrixInput } from '../lib/competitive-growth-matrix/parseInput.js';
import { compareRankRows, rankRows } from '../lib/competitive-growth-matrix/rankRows.js';
import { parseRvmUniverseInput } from '../lib/rvm-universe/buildRvmUniverse.js';
import { selectPreliminarySnapshot } from '../lib/rvm-universe/selectPreliminarySnapshot.js';
import { commercialMonthForDate } from '../lib/ventas/commercialMonth.js';

const brands = [
  { marca_id: 1, nombre_canonico: 'DONGFENG', origin_group: 'CHINESE' },
  { marca_id: 2, nombre_canonico: 'OTHER', origin_group: 'OTHER' },
  { marca_id: 3, nombre_canonico: 'UNKNOWN', origin_group: null },
];

function sale(date, brandId, modelId, extra = {}) {
  return {
    fecha_venta_iso: date, mes_venta: commercialMonthForDate(date.slice(0, 10)), marca_id: brandId, modelo_id: modelId,
    marca_nombre: brands.find((row) => row.marca_id === brandId)?.nombre_canonico,
    modelo_nombre: `MODEL ${modelId}`, product_identity_status: 'RESOLVED', ...extra,
  };
}

function market(date, units, brandId, modelId, extra = {}) {
  const brand = brands.find((row) => row.marca_id === brandId);
  return {
    fecha: date, cantidad: units, scope_brand_id: brandId, model_id: modelId,
    brand_name: brand?.nombre_canonico, model_name: `MODEL ${modelId}`,
    brand_origin_group: brand?.origin_group ?? null, identity_status: 'RESUELTO',
    organization_bucket: 'EXCLUDED_OTHER_ORGANIZATION',
    brand_aggregate_organization_bucket: 'UNRESOLVED', ...extra,
  };
}

function ventas(events, cutoff = '2026-09-09') {
  return {
    universe: 'ventas_universe_v01', version: '0.1', commercial_universe: 'COMPANY',
    analytical_events: events, period: { cutoff_date: cutoff }, validation: { valid: true },
  };
}

function rvm(events, status = 'CONSOLIDATED', snapshot = null) {
  const dates = events.map((row) => row.fecha).sort();
  return {
    universe: 'rvm_universe_v01', version: '0.1', organization_scope: 'ALL',
    data_status: status, snapshot_date: snapshot, analytical_events: events,
    period: { last_observed_date: dates.at(-1) ?? null }, validation: { valid: true },
  };
}

function parsed(extra = {}) {
  return parseGrowthMatrixInput({
    date_from: '2025-01-01', date_to: '2025-01-31',
    comparison_scopes: ['TOTAL_MARKET', 'CHINESE_MARKET', 'BRAND', 'MODEL'],
    temporal_comparisons: ['YOY_MONTH'], ...extra,
  });
}

test('closed input defaults to YOY_MONTH and ROLLING_12_YOY and rejects hidden knobs', () => {
  const result = parseGrowthMatrixInput({
    date_from: '2025-01-01', date_to: '2025-01-31', comparison_scopes: ['TOTAL_MARKET'],
  });
  assert.deepEqual(result.temporalComparisons, ['YOY_MONTH', 'ROLLING_12_YOY']);
  assert.throws(() => parseGrowthMatrixInput({
    date_from: '2025-01-01', date_to: '2025-01-31', comparison_scopes: ['TOTAL_MARKET'], score: true,
  }), /UNSUPPORTED_GROWTH_MATRIX_FIELD/);
});

test('growth matrix compares COMPANY sales with ALL RVM without a cross-domain share', () => {
  const sales = [
    ...Array.from({ length: 10 }, () => sale('2024-01-10', 1, 10)),
    ...Array.from({ length: 5 }, () => sale('2024-01-11', 2, 20)),
    ...Array.from({ length: 12 }, () => sale('2025-01-10', 1, 10)),
    ...Array.from({ length: 6 }, () => sale('2025-01-11', 2, 20)),
    sale('2025-01-12', 1, 11),
  ];
  const marketRows = [
    market('2024-01-10', 100, 1, 10), market('2024-01-11', 100, 2, 20),
    market('2025-01-10', 110, 1, 10), market('2025-01-11', 90, 2, 20),
    market('2025-01-12', 1, 1, 11),
  ];
  const series = buildGrowthSeries(ventas(sales), rvm(marketRows), brands, parsed());
  const rows = buildHistoricalRows(series, parsed());
  const total = rows.find((row) => row.comparison_scope === 'TOTAL_MARKET');
  assert.equal(total.cidef_vin_previous, 15);
  assert.equal(total.cidef_vin_current, 19);
  assert.equal(total.benchmark_vin_previous, 200);
  assert.equal(total.benchmark_vin_current, 201);
  assert.equal(total.movement_class, 'MARKET_UP__CIDEF_UP');
  const chinese = rows.find((row) => row.comparison_scope === 'CHINESE_MARKET');
  assert.equal(chinese.cidef_vin_previous, 10);
  assert.equal(chinese.cidef_vin_current, 13);
  assert.equal(chinese.benchmark_vin_previous, 100);
  assert.equal(chinese.benchmark_vin_current, 111);
  assert.equal(chinese.growth_differential_pp, 19);
  assert.equal(Object.keys(total).some((key) => /share/i.test(key)), false);
  assert.equal(series.coverage.cidef.origin.reconciles, true);
  assert.equal(series.coverage.benchmark.origin.reconciles, true);
});

test('monthly comparisons consume certified commercial mes_venta while RVM remains calendar-month based', () => {
  const scope = parsed({ comparison_scopes: ['TOTAL_MARKET'] });
  const series = buildGrowthSeries(ventas([
    sale('2024-02-01', 1, 10),
    sale('2025-01-01', 1, 10),
    sale('2025-01-31', 1, 10),
    sale('2025-02-01', 1, 10),
  ]), rvm([
    market('2024-01-01', 10, 1, 10),
    market('2025-01-01', 12, 1, 10),
  ]), brands, scope);
  const row = buildHistoricalRows(series, scope)[0];
  assert.equal(row.cidef_vin_previous, 1);
  assert.equal(row.cidef_vin_current, 2);
  assert.equal(row.benchmark_vin_previous, 10);
  assert.equal(row.benchmark_vin_current, 12);
  assert.equal(series.cidef.series.get('TOTAL_MARKET::').months.get('2024-12'), 1);
});

test('certified VENTAS commercial period is required and never reconstructed locally', () => {
  const event = sale('2025-01-10', 1, 10);
  delete event.mes_venta;
  assert.throws(
    () => buildGrowthSeries(ventas([event]), rvm([market('2025-01-10', 1, 1, 10)]), brands, parsed()),
    /commercial mes_venta is required/,
  );
});

test('monthly execution requests VENTAS through certified commercial month end', async () => {
  let ventasInput = null;
  await buildCompetitiveGrowthMatrix({
    date_from: '2025-01-01', date_to: '2025-01-31', comparison_scopes: ['TOTAL_MARKET'],
    temporal_comparisons: ['YOY_MONTH'],
  }, {
    buildVentasUniverse: async (input) => {
      ventasInput = input;
      return ventas([sale('2024-02-01', 1, 10), sale('2025-02-01', 1, 10)], input.cutoff_date);
    },
    buildRvmUniverse: async () => rvm([
      market('2024-01-01', 1, 1, 10), market('2025-01-01', 1, 1, 10),
    ]),
    query: async () => brands,
  });
  assert.equal(ventasInput.cutoff_date, '2025-02-01');
  assert.equal(ventasInput.commercial_universe, 'COMPANY');
});

test('BRAND and MODEL use the same canonical ids and ignore RVM organization buckets', () => {
  const series = buildGrowthSeries(ventas([
    sale('2024-01-10', 1, 10), sale('2025-01-10', 1, 10),
  ]), rvm([
    market('2024-01-10', 5, 1, 10, { organization_bucket: 'UNRESOLVED' }),
    market('2025-01-10', 7, 1, 10, { organization_bucket: 'INCLUDED' }),
  ]), brands, parsed());
  const rows = buildHistoricalRows(series, parsed());
  assert.equal(rows.find((row) => row.comparison_scope === 'BRAND').benchmark_vin_current, 7);
  assert.equal(rows.find((row) => row.comparison_scope === 'MODEL').model_id, 10);
});

test('zero base keeps absolute movement, null percentage and launch is not deterioration', () => {
  const scope = parsed({ comparison_scopes: ['MODEL'] });
  const series = buildGrowthSeries(ventas([sale('2024-01-10', 1, 99), sale('2025-01-10', 1, 11)]), rvm([
    market('2024-01-10', 0, 1, 11), market('2025-01-10', 2, 1, 11),
  ]), brands, scope);
  const row = buildHistoricalRows(series, scope)[0];
  assert.equal(row.cidef_growth_abs, 1);
  assert.equal(row.cidef_growth_pct, null);
  assert.equal(row.cidef_growth_pct_status, 'NOT_EVALUABLE_ZERO_BASE');
  assert.equal(row.cidef_direction, 'UP');
  assert.equal(row.movement_class, 'MARKET_UP__CIDEF_UP');
});

test('months wholly before model launch are NOT_EVALUABLE_PRE_LAUNCH', () => {
  const scope = parseGrowthMatrixInput({
    date_from: '2024-01-01', date_to: '2025-01-31', comparison_scopes: ['MODEL'],
    temporal_comparisons: ['YOY_MONTH'],
  });
  const series = buildGrowthSeries(ventas([
    sale('2023-01-10', 1, 99), sale('2025-01-10', 1, 11),
  ]), rvm([
    market('2023-01-10', 1, 1, 99), market('2024-01-10', 2, 1, 11), market('2025-01-10', 3, 1, 11),
  ]), brands, scope);
  const rows = buildHistoricalRows(series, scope);
  assert.equal(rows.find((row) => row.period === '2024-01' && row.model_id === 11).evaluation_status, 'NOT_EVALUABLE_PRE_LAUNCH');
  assert.notEqual(rows.find((row) => row.period === '2025-01' && row.model_id === 11).evaluation_status, 'NOT_EVALUABLE_PRE_LAUNCH');
});

test('ROLLING_12_YOY requires 24 observed source months', () => {
  const scope = parsed({ temporal_comparisons: ['ROLLING_12_YOY'], comparison_scopes: ['TOTAL_MARKET'] });
  const incomplete = buildGrowthSeries(ventas([
    sale('2024-02-10', 1, 10), sale('2025-01-10', 1, 10),
  ]), rvm([
    market('2024-02-10', 1, 1, 10), market('2025-01-10', 1, 1, 10),
  ]), brands, scope);
  const row = buildHistoricalRows(incomplete, scope)[0];
  assert.equal(row.evaluation_status, 'NOT_EVALUABLE_MISSING_PERIOD');
  assert.equal(row.movement_class, 'NOT_EVALUABLE');
});

test('MOM, complete ROLLING_12_YOY, CALENDAR_YEAR_YOY and YTD_YOY are supported', () => {
  const sales = [];
  const marketRows = [];
  const cursor = new Date('2023-01-10T00:00:00.000Z');
  for (let index = 0; index < 36; index += 1) {
    const date = cursor.toISOString().slice(0, 10);
    sales.push(sale(date, 1, 10));
    marketRows.push(market(date, 2, 1, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  for (const [comparison, dateFrom, dateTo] of [
    ['MOM', '2025-01-01', '2025-01-31'],
    ['ROLLING_12_YOY', '2025-01-01', '2025-01-31'],
    ['CALENDAR_YEAR_YOY', '2024-01-01', '2024-12-31'],
    ['YTD_YOY', '2025-01-01', '2025-06-30'],
  ]) {
    const scope = parseGrowthMatrixInput({
      date_from: dateFrom, date_to: dateTo, comparison_scopes: ['TOTAL_MARKET'],
      temporal_comparisons: [comparison],
    });
    const rows = buildHistoricalRows(buildGrowthSeries(ventas(sales), rvm(marketRows), brands, scope), scope);
    assert.equal(rows.length, 1, comparison);
    assert.equal(rows[0].evaluation_status, 'EVALUABLE', comparison);
    assert.equal(rows[0].movement_class, 'MARKET_FLAT__CIDEF_FLAT', comparison);
  }
});

test('CALENDAR_YEAR_YOY preserves calendar-date boundaries independently of commercial month labels', () => {
  const scope = parseGrowthMatrixInput({
    date_from: '2025-01-01', date_to: '2025-12-31', comparison_scopes: ['BRAND'],
    temporal_comparisons: ['CALENDAR_YEAR_YOY'], brand_ids: [1],
  });
  const series = buildGrowthSeries(ventas([
    sale('2024-01-01', 1, 10), sale('2024-12-31', 2, 20),
    sale('2025-01-01', 1, 10), sale('2025-12-31', 2, 20),
  ]), rvm([
    market('2024-01-01', 2, 1, 10), market('2024-12-31', 0, 2, 20),
    market('2025-01-01', 3, 1, 10), market('2025-12-31', 0, 2, 20),
  ]), brands, scope);
  const row = buildHistoricalRows(series, scope)[0];
  assert.equal(row.cidef_vin_previous, 1);
  assert.equal(row.cidef_vin_current, 1);
  assert.equal(row.benchmark_vin_previous, 2);
  assert.equal(row.benchmark_vin_current, 3);
});

test('pais_vin CHINA cannot admit a non-Chinese brand into CHINESE_MARKET', () => {
  const scope = parsed({ comparison_scopes: ['CHINESE_MARKET'] });
  const series = buildGrowthSeries(ventas([
    sale('2024-01-10', 1, 10), sale('2025-01-10', 1, 10),
  ]), rvm([
    market('2024-01-10', 10, 1, 10),
    market('2025-01-10', 10, 1, 10),
    market('2025-01-10', 99, 2, 20, { pais_vin: 'CHINA' }),
  ]), brands, scope);
  assert.equal(buildHistoricalRows(series, scope)[0].benchmark_vin_current, 10);
});

test('requested aggregate scopes remain explicit when CIDEF has zero Chinese events', () => {
  const scope = parsed({ comparison_scopes: ['CHINESE_MARKET'] });
  const series = buildGrowthSeries(ventas([
    sale('2024-01-10', 2, 20), sale('2025-01-10', 2, 20),
  ]), rvm([
    market('2024-01-10', 5, 1, 10), market('2025-01-10', 6, 1, 10),
  ]), brands, scope);
  const row = buildHistoricalRows(series, scope)[0];
  assert.equal(row.comparison_scope, 'CHINESE_MARKET');
  assert.equal(row.cidef_vin_current, 0);
  assert.equal(row.cidef_direction, 'FLAT');
});

test('FLAT is exact zero and all nine movement classes are reachable', () => {
  const directions = { UP: [1, 2], DOWN: [2, 1], FLAT: [1, 1] };
  const sales = [];
  const marketRows = [];
  let modelId = 100;
  for (const [marketDirection, [marketPrevious, marketCurrent]] of Object.entries(directions)) {
    for (const [cidefDirection, [cidefPrevious, cidefCurrent]] of Object.entries(directions)) {
      for (let i = 0; i < cidefPrevious; i += 1) sales.push(sale('2024-01-10', 1, modelId));
      for (let i = 0; i < cidefCurrent; i += 1) sales.push(sale('2025-01-10', 1, modelId));
      marketRows.push(market('2024-01-10', marketPrevious, 1, modelId));
      marketRows.push(market('2025-01-10', marketCurrent, 1, modelId));
      modelId += 1;
    }
  }
  const scope = parsed({ comparison_scopes: ['MODEL'] });
  const rows = buildHistoricalRows(buildGrowthSeries(ventas(sales), rvm(marketRows), brands, scope), scope);
  assert.deepEqual(new Set(rows.map((row) => row.movement_class)), new Set([
    'MARKET_UP__CIDEF_UP', 'MARKET_UP__CIDEF_DOWN', 'MARKET_UP__CIDEF_FLAT',
    'MARKET_DOWN__CIDEF_UP', 'MARKET_DOWN__CIDEF_DOWN', 'MARKET_DOWN__CIDEF_FLAT',
    'MARKET_FLAT__CIDEF_UP', 'MARKET_FLAT__CIDEF_DOWN', 'MARKET_FLAT__CIDEF_FLAT',
  ]));
});

test('ranking follows observable metric and deterministic tie-breakers', () => {
  const request = { metric: 'GROWTH_DIFFERENTIAL_PP', direction: 'DESC', limit: 10 };
  const base = { growth_differential_pp: 5, benchmark_vin_current: 20, cidef_vin_current: 2, brand_id: 1 };
  assert.ok(compareRankRows({ ...base, model_id: 10 }, { ...base, model_id: 11 }, request) < 0);
  assert.ok(compareRankRows({ ...base, benchmark_vin_current: 21, model_id: 12 }, { ...base, model_id: 10 }, request) < 0);
  const ranked = rankRows([
    { ...base, model_id: 10, period: '2025-01', temporal_comparison: 'YOY_MONTH', comparison_scope: 'MODEL' },
    { ...base, growth_differential_pp: null, model_id: 11, period: '2025-01', temporal_comparison: 'YOY_MONTH', comparison_scope: 'MODEL' },
  ], [request]);
  assert.deepEqual(ranked[0].groups[0].rows.map((row) => row.model_id), [10]);
});

test('CURRENT_MTD without a compatible preliminary snapshot is a functional NOT_EVALUABLE', async () => {
  const calls = [];
  const result = await buildCompetitiveGrowthMatrix({
    date_from: '2025-01-01', date_to: '2025-01-31', comparison_scopes: ['TOTAL_MARKET'],
    temporal_comparisons: ['YOY_MONTH'], include_current_mtd: true, cutoff_date: '2026-09-09',
  }, {
    buildVentasUniverse: async () => ventas([sale('2024-01-10', 1, 10), sale('2025-01-10', 1, 10)], '2026-09-09'),
    buildRvmUniverse: async (input) => {
      calls.push(input);
      return rvm([market('2024-01-10', 1, 1, 10), market('2025-01-10', 1, 1, 10)]);
    },
    query: async (sql) => (/GROUP BY snapshot_date/.test(sql) ? [] : brands),
  });
  const current = result.rows.find((row) => row.temporal_comparison === 'CURRENT_MTD');
  assert.equal(current.evaluation_status, 'NOT_EVALUABLE_NO_COMPATIBLE_SNAPSHOT');
  assert.equal(current.cidef_growth_pct_status, 'NOT_EVALUABLE_NO_COMPATIBLE_SNAPSHOT');
  assert.equal(calls.length, 1);
  assert.equal(result.status, 'WARNING');
});

test('CURRENT_MTD uses one PRELIMINARY snapshot and the same effective cutoff', async () => {
  const calls = [];
  const result = await buildCompetitiveGrowthMatrix({
    date_from: '2025-01-01', date_to: '2025-01-31', comparison_scopes: ['TOTAL_MARKET'],
    temporal_comparisons: ['YOY_MONTH'], include_current_mtd: true, cutoff_date: '2026-09-09',
  }, {
    buildVentasUniverse: async () => ventas([
      sale('2024-01-10', 1, 10), sale('2025-01-09', 1, 10), sale('2026-09-08', 1, 10),
    ], '2026-09-08'),
    buildRvmUniverse: async (input) => {
      calls.push(input);
      return input.data_status === 'PRELIMINARY'
        ? rvm([market('2026-09-08', 3, 1, 10)], 'PRELIMINARY', '2026-09-09')
        : rvm([market('2024-01-10', 1, 1, 10), market('2025-01-09', 2, 1, 10)]);
    },
    query: async (sql) => (/GROUP BY snapshot_date/.test(sql)
      ? [{ snapshot_date: '2026-09-09', min_date: '2026-09-01', max_date: '2026-09-09' }]
      : brands),
  });
  const current = result.rows.find((row) => row.temporal_comparison === 'CURRENT_MTD');
  assert.equal(current.effective_cutoff_date, '2026-09-08');
  assert.equal(current.current_days_observed, 8);
  assert.equal(current.comparison_days_observed, 8);
  assert.deepEqual(current.data_status, { current: 'PRELIMINARY', comparison: 'CONSOLIDATED' });
  assert.equal(calls.filter((call) => call.data_status === 'PRELIMINARY').length, 1);
});

test('CURRENT_MTD uses commercial periods for VENTAS and calendar periods for RVM', () => {
  const scope = parsed({ comparison_scopes: ['TOTAL_MARKET'] });
  const series = buildGrowthSeries(ventas([
    sale('2025-09-01', 1, 10), sale('2025-09-02', 1, 10), sale('2025-09-08', 1, 10),
    sale('2026-09-01', 1, 10), sale('2026-09-02', 1, 10), sale('2026-09-08', 1, 10),
  ]), rvm([
    market('2025-09-01', 1, 1, 10), market('2025-09-08', 1, 1, 10),
  ]), brands, scope);
  const preliminary = buildPreliminarySeries(rvm([
    market('2026-09-01', 1, 1, 10), market('2026-09-08', 1, 1, 10),
  ], 'PRELIMINARY', '2026-09-09'), series.brandCatalog);
  const row = buildCurrentMtdRows(series, preliminary, scope, '2026-09-08')[0];
  assert.equal(row.cidef_vin_current, 2);
  assert.equal(row.cidef_vin_previous, 2);
  assert.equal(row.benchmark_vin_current, 2);
  assert.equal(row.benchmark_vin_previous, 2);
});

test('PRELIMINARY universe requires an explicit snapshot and selector preserves Share Transfer rule', () => {
  assert.throws(() => parseRvmUniverseInput({
    date_from: '2026-09-01', date_to: '2026-09-09', data_status: 'PRELIMINARY',
  }), /SNAPSHOT_DATE_REQUIRED_FOR_PRELIMINARY/);
  assert.equal(selectPreliminarySnapshot([{ snapshot_date: '2026-09-09', min_date: '2026-09-01', max_date: '2026-09-09' }], {
    dateFrom: '2026-09-01', cutoffDate: '2026-09-09',
  }).selected.snapshot_date, '2026-09-09');
});

test('production sources consume certified universes and contain no share-transfer numerator logic', async () => {
  const sources = await Promise.all([
    'buildCompetitiveGrowthMatrix.js', 'buildSeries.js', 'comparePeriods.js',
  ].map((name) => readFile(new URL(`../lib/competitive-growth-matrix/${name}`, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.match(source, /buildVentasUniverse/);
  assert.match(source, /buildRvmUniverse/);
  assert.doesNotMatch(source, /brand_aggregate_organization_bucket|organization_bucket.*cidef|pais_vin\s*=\s*['"]CHINA/i);
  assert.doesNotMatch(source, /market_share|share_change|capture_share|peer_entity|competitor_entity/i);
  const query = buildGrowthRvmQuery({
    date_from: '2024-01-01', date_to: '2025-01-31', organization_scope: 'ALL', data_status: 'CONSOLIDATED',
  });
  assert.match(query.sql, /rvm_universe_v01/);
  assert.match(query.sql, /sum\(coalesce\(u\.cantidad,0\)\)/);
  assert.doesNotMatch(query.sql, /organization_bucket.*AS cidef/i);
});
