import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasContext } from '../lib/ventas/buildVentasContext.js';
import { calculateVentasDailyContext } from '../lib/motors/ventas-daily-context-v01.js';

function row(overrides = {}) {
  return {
    id: '1',
    nro_operacion: 'OP1',
    razon_social: 'Cliente Uno',
    cliente: 'C1',
    articulo: 'SKU1',
    desc_articulo: 'Modelo 1',
    nro_vin_chasis: 'VIN1',
    nombre_usuario: 'V1',
    fecha_factura: '04/10/26 10:00',
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

function saleSignature(context) {
  return context.recognizedSales.map((sale) => ({
    vin: sale.vin,
    source_id: sale.source_id,
    fecha_venta_iso: sale.fecha_venta_iso,
    recognition_basis: sale.recognition_basis,
  }));
}

test('month-end cutoff_date is equivalent to cutoff_month', () => {
  const rows = [
    row({ id: '1', nro_vin_chasis: 'VIN1', fecha_factura: '04/10/26 10:00' }),
    row({ id: '2', nro_vin_chasis: 'VIN1', fecha_factura: '04/30/26 18:00' }),
    row({ id: '3', nro_vin_chasis: 'VIN2', fecha_factura: '05/01/26 08:00' }),
  ];
  const monthly = calculateVentasContext(rows, { cutoffMonth: '2026-04' });
  const daily = calculateVentasContext(rows, { cutoffDate: '2026-04-30' });

  assert.deepEqual(saleSignature(daily), saleSignature(monthly));
  assert.deepEqual(daily.monthlySales, monthly.monthlySales);
  assert.equal(daily.coverage.rows_inside_cutoff, monthly.coverage.rows_inside_cutoff);
});

test('daily cutoff excludes future evidence before LAST-by-VIN', () => {
  const rows = [
    row({ id: '1', cliente: 'EARLY', fecha_factura: '04/10/26 10:00' }),
    row({ id: '2', cliente: 'FUTURE', fecha_factura: '04/25/26 10:00' }),
  ];
  const early = calculateVentasContext(rows, { cutoffDate: '2026-04-15' });
  const late = calculateVentasContext(rows, { cutoffDate: '2026-04-30' });

  assert.equal(early.recognizedSales[0].source_id, '1');
  assert.equal(early.recognizedSales[0].cliente, 'EARLY');
  assert.equal(late.recognizedSales[0].source_id, '2');
  assert.equal(early.coverage.rows_excluded_by_cutoff, 1);
});

test('cutoff inputs are strict and mutually exclusive', () => {
  assert.throws(
    () => calculateVentasContext([row()], { cutoffMonth: '2026-04', cutoffDate: '2026-04-30' }),
    /not both/,
  );
  assert.throws(
    () => calculateVentasContext([row()], { cutoffDate: '2026-02-30' }),
    /valid YYYY-MM-DD/,
  );
});

test('daily motor exposes cutoff-safe snapshot without organization filtering', () => {
  const context = calculateVentasContext([row()], { cutoffDate: '2026-04-15' });
  const result = calculateVentasDailyContext(context, { cutoffDate: '2026-04-15' });

  assert.equal(result.status, 'ok');
  assert.equal(result.as_of.month_sales_to_date, 1);
  assert.equal(result.as_of.day_of_month, 15);
  assert.equal(result.validation.cutoff_context_match, true);
  assert.equal(result.policy.organization_scope.includes('not filtered'), true);
});
