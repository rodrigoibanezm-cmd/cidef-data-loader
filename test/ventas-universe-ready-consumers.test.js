import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlySales } from '../lib/ventas/buildMonthlySales.js';
import { calculateVentasMonthlyActual } from '../lib/motors/ventas-monthly-actual-v01.js';
import { calculateVentasDailyContext } from '../lib/motors/ventas-daily-context-v01.js';
import { calculateExpectedMonthlyCandidates } from '../lib/motors/expected-monthly-candidates-v01.js';
import { calculateExpectedMonthlyBacktest } from '../lib/motors/expected-monthly-backtest-v01.js';
import { calculateExpectedMonthlyStability } from '../lib/motors/expected-monthly-stability-v01.js';
import { ventasContextFromUniverse } from '../lib/ventas-universe/buildVentasMonthlyAnalyticalContext.js';

function monthKey(index) {
  const year = 2023 + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function eventsFromValues(values) {
  return values.flatMap((sales, index) => Array.from({ length: sales }, (_, unit) => ({
    vin: `VIN-${index}-${unit}`,
    mes_venta: monthKey(index),
    fecha_venta_iso: `${monthKey(index)}-15T00:00:00.000Z`,
  })));
}

function pair(values, { cutoffMonth = null, cutoffDate = null } = {}) {
  const analyticalEvents = eventsFromValues(values);
  const coverage = {
    source_rows: analyticalEvents.length,
    rows_inside_cutoff: analyticalEvents.length,
    rows_excluded_by_cutoff: 0,
    assignable_non_null_vins: analyticalEvents.length,
  };
  const validation = {
    recognized_units: analyticalEvents.length,
    monthly_units: analyticalEvents.length,
    expected_assignable_units: analyticalEvents.length,
    recognized_matches_monthly: true,
    recognized_matches_expected: true,
    ok: true,
  };
  const policy = { recognition: 'fixture LAST-by-VIN' };
  const warnings = ['fixture-warning'];
  const legacy = {
    context: 'ventas_context_v01', version: '0.3', policy,
    cutoff_month: cutoffMonth, cutoff_date: cutoffDate,
    coverage, recognizedSales: analyticalEvents,
    monthlySales: buildMonthlySales(analyticalEvents), validation, warnings,
  };
  const universe = {
    universe: 'ventas_universe_v01', version: '0.1', commercial_universe: 'COMPANY',
    analytical_events: analyticalEvents,
    recognition_version: '0.3', recognition_policy: policy,
    period: { cutoff_month: cutoffMonth, cutoff_date: cutoffDate },
    coverage: { recognition: coverage }, source_validation: validation, warnings,
  };
  return { legacy, migrated: ventasContextFromUniverse(universe) };
}

test('shared universe adapter preserves monthly series, cutoff, coverage, validation and warnings', () => {
  const { legacy, migrated } = pair([2, 0, 3], { cutoffMonth: '2023-03' });
  assert.deepEqual(migrated, legacy);
});

test('ventas_monthly_actual_v01 is output-equivalent before and after universe adaptation', () => {
  const contexts = pair([2, 3, 4], { cutoffMonth: '2023-03' });
  const parsed = { cutoffMonth: '2023-03', targetMonth: '2023-03' };
  assert.deepEqual(
    calculateVentasMonthlyActual(contexts.migrated, parsed),
    calculateVentasMonthlyActual(contexts.legacy, parsed),
  );
});

test('ventas_daily_context_v01 preserves accumulated VIN, cutoff and reconciliation', () => {
  const contexts = pair([2, 3, 4], { cutoffDate: '2023-03-20' });
  const parsed = { cutoffDate: '2023-03-20' };
  const legacy = calculateVentasDailyContext(contexts.legacy, parsed);
  const migrated = calculateVentasDailyContext(contexts.migrated, parsed);
  assert.deepEqual(migrated, legacy);
  assert.equal(migrated.as_of.month_sales_to_date, 4);
  assert.equal(migrated.as_of.recognized_sales_total, 9);
});

test('expected_monthly_candidates_v01 preserves candidate values and order', () => {
  const values = Array.from({ length: 30 }, (_, index) => 2 + (index % 5));
  const contexts = pair(values, { cutoffMonth: '2025-05' });
  const input = { cutoff_month: '2025-05', target_month: '2025-06' };
  assert.deepEqual(
    calculateExpectedMonthlyCandidates(contexts.migrated, input),
    calculateExpectedMonthlyCandidates(contexts.legacy, input),
  );
});

test('expected_monthly_backtest_v01 preserves observations, forecasts and metrics', () => {
  const values = Array.from({ length: 42 }, (_, index) => 3 + (index % 7));
  const contexts = pair(values);
  assert.deepEqual(
    calculateExpectedMonthlyBacktest(contexts.migrated),
    calculateExpectedMonthlyBacktest(contexts.legacy),
  );
});

test('expected_monthly_stability_v01 preserves windows and final output', () => {
  const values = Array.from({ length: 42 }, (_, index) => 3 + (index % 7));
  const contexts = pair(values);
  assert.deepEqual(
    calculateExpectedMonthlyStability(contexts.migrated),
    calculateExpectedMonthlyStability(contexts.legacy),
  );
});

test('five migrated consumers contain no prohibited local reconstruction', async () => {
  const { readFile } = await import('node:fs/promises');
  const files = [
    '../lib/motors/ventas-monthly-actual-v01.js',
    '../lib/motors/ventas-daily-context-v01.js',
    '../lib/motors/expected-monthly-candidates-v01.js',
    '../lib/motors/expected-monthly-backtest-v01.js',
    '../lib/motors/expected-monthly-stability-v01.js',
  ];
  const prohibited = /buildVentasContext|loadOrganizationalIdentityMaps|loadProductIdentityMap|loadSkuEvidence|ventas_raw|sucursales_master|personas_master|producto_aliases_v01/;
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /buildVentasMonthlyAnalyticalContext/, file);
    assert.doesNotMatch(source, prohibited, file);
  }
});

test('shared adapter rejects a non-COMPANY universe', () => {
  assert.throws(() => ventasContextFromUniverse({
    commercial_universe: 'OWN_STORES', analytical_events: [],
  }), /COMPANY ventas_universe_v01 is required/);
});
