import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasCrossMonthFirstLastAudit } from '../lib/motors/ventas-cross-month-first-last-audit-v01.js';

test('audits only VINs whose FIRST and LAST are in different months', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'A', fecha_factura: '01/05/25 0:00', cliente: 'FK SPA', nro_factura: '1', nro_operacion: '10', nro_propuesta: '100', desc_tipo_oper: 'Venta Rodados', desc_sucursal_vta: 'X', nombre_usuario: 'U1', precio_vta_pesos_con_iva: '100' },
    { id: 2, nro_vin_chasis: 'A', fecha_factura: '02/05/25 0:00', cliente: 'OTRO', nro_factura: '2', nro_operacion: '11', nro_propuesta: '101', desc_tipo_oper: 'Venta Rodados', desc_sucursal_vta: 'Y', nombre_usuario: 'U2', precio_vta_pesos_con_iva: '120' },
    { id: 3, nro_vin_chasis: 'B', fecha_factura: '03/01/25 0:00', cliente: 'X' },
    { id: 4, nro_vin_chasis: 'B', fecha_factura: '03/20/25 0:00', cliente: 'Y' },
  ];
  const result = calculateVentasCrossMonthFirstLastAudit(rows, { start_month: '2025-01', end_month: '2025-12' });
  assert.equal(result.coverage.universe_vins, 1);
  assert.equal(result.month_transfers[0].from_month, '2025-01');
  assert.equal(result.month_transfers[0].to_month, '2025-02');
  assert.equal(result.attribute_comparison.cliente.different, 1);
  assert.equal(result.customer_analysis.special_customers['FK SPA'].first_only, 1);
});

test('reports extreme-date ties and uses stable id only as technical tie-break', () => {
  const rows = [
    { id: 9, nro_vin_chasis: 'A', fecha_factura: '01/01/25 0:00', cliente: 'SECOND-ID' },
    { id: 2, nro_vin_chasis: 'A', fecha_factura: '01/01/25 0:00', cliente: 'LOW-ID' },
    { id: 5, nro_vin_chasis: 'A', fecha_factura: '02/01/25 0:00', cliente: 'LAST' },
  ];
  const result = calculateVentasCrossMonthFirstLastAudit(rows, { start_month: '2025-01', end_month: '2025-02' });
  assert.equal(result.tie_audit.first_extreme_tie_vins, 1);
  assert.equal(result.ambiguous_vins, 1);
  assert.equal(result.examples[0].first.id, 2);
  assert.match(result.tie_audit.tie_breaker, /technical only/);
});

test('special customer transitions are directional', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'A', fecha_factura: '01/01/25 0:00', cliente: 'FK SPA' },
    { id: 2, nro_vin_chasis: 'A', fecha_factura: '02/01/25 0:00', cliente: 'CLIENTE FINAL' },
    { id: 3, nro_vin_chasis: 'B', fecha_factura: '01/01/25 0:00', cliente: 'CLIENTE FINAL' },
    { id: 4, nro_vin_chasis: 'B', fecha_factura: '02/01/25 0:00', cliente: 'CIDEF S.A.' },
  ];
  const result = calculateVentasCrossMonthFirstLastAudit(rows, { start_month: '2025-01', end_month: '2025-02' });
  assert.equal(result.customer_analysis.special_customers['FK SPA'].transitions_to_other_customer, 1);
  assert.equal(result.customer_analysis.special_customers['CIDEF S.A.'].transitions_from_other_customer, 1);
});

test('special customers are recognized through razon_social when cliente is a code', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'A', fecha_factura: '09/01/25 0:00', cliente: '77050575', razon_social: 'FK SPA' },
    { id: 2, nro_vin_chasis: 'A', fecha_factura: '10/01/25 0:00', cliente: '11111111', razon_social: 'AUTOMOTRIZ ROSSELOT S.A.' },
    { id: 3, nro_vin_chasis: 'B', fecha_factura: '12/01/25 0:00', cliente: '96800910', razon_social: 'CIDEF S.A.' },
    { id: 4, nro_vin_chasis: 'B', fecha_factura: '01/01/26 0:00', cliente: '22222222', razon_social: 'COMERCIAL COLON LIMITADA' },
  ];
  const result = calculateVentasCrossMonthFirstLastAudit(rows, { start_month: '2025-01', end_month: '2026-07' });
  assert.equal(result.customer_analysis.special_customers['FK SPA'].first_only, 1);
  assert.equal(result.customer_analysis.special_customers['CIDEF S.A.'].first_only, 1);
});

test('dominant FIRST audit measures transition to different LAST customer and cohorts', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'A', fecha_factura: '09/01/25 0:00', cliente: 'C1', nro_factura: '1' },
    { id: 2, nro_vin_chasis: 'A', fecha_factura: '10/01/25 0:00', cliente: 'L1', nro_factura: '2' },
    { id: 3, nro_vin_chasis: 'B', fecha_factura: '12/01/25 0:00', cliente: 'C2', nro_factura: '3' },
    { id: 4, nro_vin_chasis: 'B', fecha_factura: '01/01/26 0:00', cliente: 'L2', nro_factura: '4' },
    { id: 5, nro_vin_chasis: 'C', fecha_factura: '03/01/25 0:00', cliente: 'C3', nro_factura: '5' },
    { id: 6, nro_vin_chasis: 'C', fecha_factura: '04/01/25 0:00', cliente: 'C3', nro_factura: '6' },
    { id: 7, nro_vin_chasis: 'D', fecha_factura: '05/01/25 0:00', cliente: 'C4', nro_factura: '7' },
    { id: 8, nro_vin_chasis: 'D', fecha_factura: '06/01/25 0:00', cliente: 'L4', nro_factura: '8' },
  ];
  const result = calculateVentasCrossMonthFirstLastAudit(rows, { start_month: '2025-01', end_month: '2026-07' });
  const audit = result.customer_analysis.dominant_first_customer_audit;
  assert.equal(audit.covered_vins, 3);
  assert.equal(audit.transitions_to_different_last_customer, 2);
  assert.equal(audit.stays_same_customer, 1);
  assert.equal(result.cohort_analysis.find((row) => row.cohort === 'FIRST_2025-09').vins, 1);
  assert.equal(result.cohort_analysis.find((row) => row.cohort === 'FIRST_2025-12').vins, 1);
  assert.ok(result.cross_dimensions.rows.length > 0);
});

test('VIN with any bad date is excluded to match sensitivity universe policy', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'A', fecha_factura: 'bad' },
    { id: 2, nro_vin_chasis: 'A', fecha_factura: '01/01/25 0:00' },
    { id: 3, nro_vin_chasis: 'A', fecha_factura: '02/01/25 0:00' },
  ];
  const result = calculateVentasCrossMonthFirstLastAudit(rows, { start_month: '2025-01', end_month: '2025-12' });
  assert.equal(result.coverage.excluded_vins_with_date_errors, 1);
  assert.equal(result.coverage.universe_vins, 0);
  assert.equal(result.status, 'warning');
});

test('null VINs and bad dates do not enter the audit universe', () => {
  const rows = [
    { id: 1, nro_vin_chasis: null, fecha_factura: '01/01/25 0:00' },
    { id: 2, nro_vin_chasis: 'A', fecha_factura: 'bad' },
    { id: 3, nro_vin_chasis: 'A', fecha_factura: '02/01/25 0:00' },
  ];
  const result = calculateVentasCrossMonthFirstLastAudit(rows, { start_month: '2025-01', end_month: '2025-12' });
  assert.equal(result.coverage.null_vin_rows, 1);
  assert.equal(result.coverage.parse_errors, 1);
  assert.equal(result.coverage.universe_vins, 0);
  assert.equal(result.status, 'warning');
});
