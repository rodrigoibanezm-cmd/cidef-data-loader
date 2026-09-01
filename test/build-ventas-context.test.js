import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasContext } from '../lib/ventas/buildVentasContext.js';

function row(overrides = {}) {
  return {
    id: '1',
    nro_operacion: 'OP1',
    razon_social: 'Cliente Uno',
    cliente: 'C1',
    articulo: 'SKU1',
    desc_articulo: 'Modelo 1',
    nro_vin_chasis: 'VIN1',
    nombre_usuario: 'VENDEDOR 1',
    fecha_factura: '01/15/26 10:00',
    precio_vta: '100',
    precio_vta_pesos_con_iva: '119',
    id_sucursal_vta: 'S1',
    desc_sucursal_vta: 'Sucursal 1',
    id_mae_marca: 'M1',
    desc_mae_marca: 'Marca 1',
    nro_propuesta: 'P1',
    factura: 'FVE',
    nro_factura: '1001',
    ...overrides,
  };
}

test('recognizes one sale per non-null VIN using global LAST fecha_factura', () => {
  const ctx = calculateVentasContext([
    row({ id: '1', fecha_factura: '01/15/26 10:00', cliente: 'FIRST', nro_factura: '1001' }),
    row({ id: '2', fecha_factura: '02/10/26 09:00', cliente: 'LAST', nro_factura: '1002' }),
  ]);

  assert.equal(ctx.validation.recognized_units, 1);
  assert.equal(ctx.recognizedSales[0].mes_venta, '2026-02');
  assert.equal(ctx.recognizedSales[0].cliente, 'LAST');
  assert.equal(ctx.recognizedSales[0].nro_factura, '1002');
  assert.equal(ctx.recognizedSales[0].recognition_basis, 'vin_last_fecha_factura');
  assert.equal(ctx.coverage.cross_month_vins, 1);
  assert.equal(ctx.validation.ok, true);
});

test('counts null VIN rows independently', () => {
  const ctx = calculateVentasContext([
    row({ id: '1', nro_vin_chasis: null, fecha_factura: '01/01/26 08:00' }),
    row({ id: '2', nro_vin_chasis: ' ', fecha_factura: '01/02/26 08:00' }),
  ]);

  assert.equal(ctx.validation.recognized_units, 2);
  assert.equal(ctx.coverage.null_vin_rows, 2);
  assert.equal(ctx.coverage.assignable_null_vin_rows, 2);
  assert.equal(ctx.monthlySales[0].month, '2026-01');
  assert.equal(ctx.monthlySales[0].sales, 2);
  assert.ok(ctx.recognizedSales.every((sale) => sale.recognition_basis === 'null_vin_row'));
});

test('uses lowest stable id only for an exact LAST fecha_factura tie', () => {
  const ctx = calculateVentasContext([
    row({ id: '10', fecha_factura: '02/10/26 09:00', cliente: 'TEN' }),
    row({ id: '2', fecha_factura: '02/10/26 09:00', cliente: 'TWO' }),
    row({ id: '1', fecha_factura: '01/01/26 09:00', cliente: 'OLD' }),
  ]);

  assert.equal(ctx.validation.recognized_units, 1);
  assert.equal(ctx.recognizedSales[0].source_id, '2');
  assert.equal(ctx.recognizedSales[0].cliente, 'TWO');
  assert.equal(ctx.coverage.exact_last_tie_vins, 1);
});

test('excludes entire non-null VIN when any row has invalid or missing fecha_factura', () => {
  const ctx = calculateVentasContext([
    row({ id: '1', nro_vin_chasis: 'VIN_BAD', fecha_factura: '01/01/26 09:00' }),
    row({ id: '2', nro_vin_chasis: 'VIN_BAD', fecha_factura: null }),
    row({ id: '3', nro_vin_chasis: 'VIN_OK', fecha_factura: '03/01/26 09:00' }),
  ]);

  assert.equal(ctx.coverage.distinct_non_null_vins, 2);
  assert.equal(ctx.coverage.excluded_vins_with_date_errors, 1);
  assert.equal(ctx.validation.recognized_units, 1);
  assert.equal(ctx.recognizedSales[0].vin, 'VIN_OK');
  assert.equal(ctx.validation.ok, true);
});

test('monthly payload reconciles exactly with recognized sales', () => {
  const ctx = calculateVentasContext([
    row({ id: '1', nro_vin_chasis: 'VIN1', fecha_factura: '01/01/26 09:00' }),
    row({ id: '2', nro_vin_chasis: 'VIN2', fecha_factura: '01/02/26 09:00' }),
    row({ id: '3', nro_vin_chasis: 'VIN3', fecha_factura: '02/01/26 09:00' }),
    row({ id: '4', nro_vin_chasis: null, fecha_factura: '02/03/26 09:00' }),
  ]);

  assert.deepEqual(ctx.monthlySales, [
    { month: '2026-01', sales: 2 },
    { month: '2026-02', sales: 2 },
  ]);
  assert.equal(ctx.validation.recognized_units, 4);
  assert.equal(ctx.validation.monthly_units, 4);
  assert.equal(ctx.validation.expected_assignable_units, 4);
  assert.equal(ctx.validation.ok, true);
});
