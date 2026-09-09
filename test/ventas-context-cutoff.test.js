import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasContext } from '../lib/ventas/buildVentasContext.js';

function row(id, date, overrides = {}) {
  return {
    id,
    nro_operacion: `OP${id}`,
    nro_vin_chasis: 'VIN1',
    fecha_factura: date,
    ...overrides,
  };
}

test('applies blind cutoff before LAST recognition by VIN', () => {
  const rows = [
    row('1', '05/20/26 10:00', { cliente: 'MAY' }),
    row('2', '07/10/26 10:00', { cliente: 'JULY' }),
  ];

  const full = calculateVentasContext(rows);
  const blind = calculateVentasContext(rows, { cutoffMonth: '2026-06' });

  assert.equal(full.recognizedSales[0].mes_venta, '2026-07');
  assert.equal(full.recognizedSales[0].cliente, 'JULY');
  assert.equal(blind.recognizedSales[0].mes_venta, '2026-05');
  assert.equal(blind.recognizedSales[0].cliente, 'MAY');
  assert.equal(blind.cutoff_month, '2026-06');
  assert.equal(blind.effective_cutoff_date, '2026-07-01');
  assert.equal(blind.coverage.rows_excluded_by_cutoff, 1);
});

test('cutoff_month includes next calendar month day 01 and excludes day 02', () => {
  const rows = [
    row('1', '09/30/26 10:00', { cliente: 'SEP30' }),
    row('2', '10/01/26 10:00', { cliente: 'OCT1' }),
    row('3', '10/02/26 10:00', { cliente: 'OCT2' }),
  ];
  const september = calculateVentasContext(rows, { cutoffMonth: '2026-09' });
  assert.equal(september.recognizedSales.length, 1);
  assert.equal(september.recognizedSales[0].cliente, 'OCT1');
  assert.equal(september.recognizedSales[0].mes_venta, '2026-09');
  assert.equal(september.coverage.rows_excluded_by_cutoff, 1);
});
