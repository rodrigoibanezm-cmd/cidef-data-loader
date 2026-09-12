import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateVentasMonthlyDedupSensitivity,
  parseFechaFactura,
} from '../lib/motors/ventas-monthly-dedup-sensitivity-v01.js';

test('parseFechaFactura parses observed RAW format and leap day', () => {
  assert.equal(parseFechaFactura('12/31/25 0:00').month, '2025-12');
  assert.equal(parseFechaFactura('1/5/2025 9:07').month, '2025-01');
  assert.equal(parseFechaFactura('02/29/24 23:59').month, '2024-02');
  assert.equal(parseFechaFactura('02/29/23 23:59').error, 'invalid_date');
  assert.equal(parseFechaFactura('2025-01-01').month, '2025-01');
});

test('canonical dates retain calendar components and legacy date outputs', () => {
  for (const [canonical, legacy, expected] of [
    ['2026-08-31 00:00:00', '8/31/26 0:00:00', '2026-08-31T00:00:00.000Z'],
    ['2020-05-31 00:00:00', '5/31/2020 0:00:00', '2020-05-31T00:00:00.000Z'],
    ['2024-02-29 23:59:59', '2/29/24 23:59:59', '2024-02-29T23:59:59.000Z'],
  ]) {
    const parsed = parseFechaFactura(canonical);
    const old = parseFechaFactura(legacy);
    assert.equal(parsed.date.toISOString(), expected);
    assert.deepEqual(parsed.date, old.date);
    assert.equal(parsed.month, old.month);
    assert.equal(parsed.raw, canonical);
  }
  for (const value of ['2026-08-31', '2026-08-31 0:00', '2026-08-31 0:00:00']) {
    assert.equal(parseFechaFactura(value).date.toISOString(), '2026-08-31T00:00:00.000Z');
  }
});

test('canonical parser rejects invalid calendars, times and unsupported formats', () => {
  for (const value of ['2023-02-29', '2026-02-30', '2026-04-31', '2026-00-01',
    '2026-13-01', '2026-01-00', '2026-01-32', '2026-01-02 24:00:00',
    '2026-01-02 0:60:00', '2026-01-02 0:00:60']) {
    assert.equal(parseFechaFactura(value).error, 'invalid_date', value);
  }
  for (const value of ['bad-date', '31/08/2026', '2026-8-31',
    '2026-08-31T00:00:00Z', '2026-08-31 00:00:00+00:00', '46635']) {
    assert.ok(parseFechaFactura(value).error, value);
  }
  assert.equal(parseFechaFactura(null), null);
  assert.equal(parseFechaFactura(''), null);
});

test('single VIN stays in same month in FIRST and LAST', () => {
  const result = calculateVentasMonthlyDedupSensitivity([
    { nro_vin_chasis: 'VIN-A', fecha_factura: '01/10/25 0:00' },
  ], { start_month: '2025-01', end_month: '2025-01' });
  assert.equal(result.monthly[0].sales_first, 1);
  assert.equal(result.monthly[0].sales_last, 1);
  assert.equal(result.validation.global_signed_delta, 0);
});

test('repeated VIN in same month does not change monthly series', () => {
  const result = calculateVentasMonthlyDedupSensitivity([
    { nro_vin_chasis: 'VIN-A', fecha_factura: '01/05/25 0:00' },
    { nro_vin_chasis: 'VIN-A', fecha_factura: '01/28/25 0:00' },
  ], { start_month: '2025-01', end_month: '2025-01' });
  assert.equal(result.monthly[0].sales_first, 1);
  assert.equal(result.monthly[0].sales_last, 1);
  assert.equal(result.duplicate_analysis.vins_same_first_last_month, 1);
});

test('repeated VIN in different months moves one unit from FIRST to LAST', () => {
  const result = calculateVentasMonthlyDedupSensitivity([
    { nro_vin_chasis: 'VIN-A', fecha_factura: '01/31/25 0:00' },
    { nro_vin_chasis: 'VIN-A', fecha_factura: '02/05/25 0:00' },
  ], { start_month: '2025-01', end_month: '2025-02' });
  assert.deepEqual(result.monthly.map((row) => [row.month, row.sales_first, row.sales_last]), [
    ['2025-01', 1, 0],
    ['2025-02', 0, 1],
  ]);
  assert.equal(result.duplicate_analysis.vins_with_different_first_last_month, 1);
  assert.deepEqual(result.month_transfers, [
    { from_month: '2025-01', to_month: '2025-02', vin_count: 1 },
  ]);
});

test('same extreme date still counts VIN once', () => {
  const result = calculateVentasMonthlyDedupSensitivity([
    { nro_vin_chasis: 'VIN-A', fecha_factura: '01/01/24 0:00' },
    { nro_vin_chasis: 'VIN-A', fecha_factura: '03/20/24 0:00' },
    { nro_vin_chasis: 'VIN-A', fecha_factura: '03/20/24 0:00' },
  ], { start_month: '2024-01', end_month: '2024-03' });
  assert.equal(result.monthly[0].sales_first, 1);
  assert.equal(result.monthly[2].sales_last, 1);
  assert.equal(result.validation.total_units_first_global, 1);
  assert.equal(result.validation.total_units_last_global, 1);
});

test('null VIN rows count independently in both scenarios', () => {
  const result = calculateVentasMonthlyDedupSensitivity([
    { nro_vin_chasis: null, fecha_factura: '01/02/25 0:00' },
    { nro_vin_chasis: '', fecha_factura: '01/03/25 0:00' },
    { nro_vin_chasis: null, fecha_factura: '02/01/25 0:00' },
  ], { start_month: '2025-01', end_month: '2025-02' });
  assert.deepEqual(result.monthly.map((row) => [row.sales_first, row.sales_last]), [
    [2, 2],
    [1, 1],
  ]);
  assert.equal(result.coverage.null_vin_rows, 3);
});

test('global reconciliation holds even when window reconciliation does not', () => {
  const result = calculateVentasMonthlyDedupSensitivity([
    { nro_vin_chasis: 'VIN-A', fecha_factura: '12/31/24 0:00' },
    { nro_vin_chasis: 'VIN-A', fecha_factura: '01/05/25 0:00' },
  ], { start_month: '2025-01', end_month: '2025-01' });
  assert.equal(result.validation.global_signed_delta, 0);
  assert.equal(result.validation.window_signed_delta, 1);
  assert.equal(result.validation.totals_match, true);
});

test('unparseable dates are reported and not silently assigned', () => {
  const result = calculateVentasMonthlyDedupSensitivity([
    { nro_vin_chasis: 'VIN-A', fecha_factura: 'bad-date' },
    { nro_vin_chasis: null, fecha_factura: null },
  ], { start_month: '2025-01', end_month: '2025-01' });
  assert.equal(result.status, 'warning');
  assert.equal(result.coverage.unparseable_fecha_factura_rows, 1);
  assert.equal(result.coverage.null_fecha_factura_rows, 1);
  assert.equal(result.coverage.vins_with_date_errors, 1);
  assert.equal(result.coverage.unassignable_null_vin_rows, 1);
  assert.equal(result.validation.expected_units_raw, 2);
  assert.equal(result.validation.expected_units_assignable, 0);
  assert.ok(result.warnings.length >= 2);
});
