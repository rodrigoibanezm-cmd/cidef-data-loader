import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasUnresolvedRecognitionEvidence } from '../lib/motors/ventas-unresolved-recognition-evidence-v01.js';

const input = {
  start_month: '2021-01',
  end_month: '2026-07',
  dominant_first_customers: ['DOM'],
};

function ventasFixture() {
  return [
    { id: '1', nro_vin_chasis: 'RESOLVED', fecha_factura: '01/05/25 0:00', cliente: 'DOM', razon_social: 'Dominante', nro_operacion: 'R1', factura: 'F1', nro_factura: '1' },
    { id: '2', nro_vin_chasis: 'RESOLVED', fecha_factura: '02/05/25 0:00', cliente: 'FINAL', razon_social: 'Final', nro_operacion: 'R2', factura: 'F2', nro_factura: '2' },
    { id: '3', nro_vin_chasis: 'UNRES', fecha_factura: '01/10/22 0:00', cliente: 'OTHER', razon_social: 'Other', nro_operacion: 'U1', factura: 'UF1', nro_factura: '101' },
    { id: '4', nro_vin_chasis: 'UNRES', fecha_factura: '03/10/23 0:00', cliente: 'FINAL2', razon_social: 'Final 2', nro_operacion: 'U2', factura: 'UF2', nro_factura: '202' },
    { id: '5', nro_vin_chasis: 'SAME', fecha_factura: '04/01/24 0:00', cliente: 'X', nro_operacion: 'S1', factura: 'SF1' },
    { id: '6', nro_vin_chasis: 'SAME', fecha_factura: '04/20/24 0:00', cliente: 'Y', nro_operacion: 'S2', factura: 'SF2' },
  ];
}

test('isolates only unresolved cross-month VINs', () => {
  const result = calculateVentasUnresolvedRecognitionEvidence(ventasFixture(), [], [], input);
  assert.equal(result.coverage.cross_month_vins, 2);
  assert.equal(result.coverage.resolved_cross_month_vins, 1);
  assert.equal(result.coverage.unresolved_vins, 1);
  assert.equal(result.unresolved_records.length, 1);
  assert.equal(result.unresolved_records[0].vin, 'UNRES');
  assert.equal(result.validation.cross_partition_ok, true);
});

test('notas evidence uses exact operation before invoice/date and reports status', () => {
  const notas = [
    {
      chasis: 'UNRES', nro_operacion: 'U1', factura: 'UF1', fecha_factura: '01/10/22 0:00',
      tiene_operacion: 'SI', esta_autorizado: 'SI', esta_pendiente_entrega: 'NO', etapa: 'FIRST_STAGE',
    },
    {
      chasis: 'UNRES', nro_operacion: 'U2', factura: 'UF2', fecha_factura: '03/10/23 0:00',
      tiene_operacion: 'SI', esta_autorizado: 'SI', esta_pendiente_entrega: 'NO', etapa: 'LAST_STAGE',
    },
  ];
  const result = calculateVentasUnresolvedRecognitionEvidence(ventasFixture(), notas, [], input);
  const record = result.unresolved_records[0];
  assert.equal(record.notas.event_presence, 'both');
  assert.equal(record.notas.first.match_basis, 'nro_operacion');
  assert.equal(record.notas.last.match_basis, 'nro_operacion');
  assert.equal(record.notas.first.top.etapa[0].value, 'FIRST_STAGE');
  assert.equal(record.notas.last.top.etapa[0].value, 'LAST_STAGE');
});

test('vehiculos current snapshot can align uniquely to LAST by invoice/date', () => {
  const vehiculos = [
    {
      vin_chasis: 'UNRES', factura: 'UF2', numero_factura: '202', fecha_factura: '03/10/23 0:00',
      cliente: 'FINAL2', vigente: '0', etapa: 'FACTURADO', pendiente_entrega: '0', nota_de_venta: 'NV2',
    },
  ];
  const result = calculateVentasUnresolvedRecognitionEvidence(ventasFixture(), [], vehiculos, input);
  const record = result.unresolved_records[0];
  assert.equal(record.vehiculos.event_alignment, 'last_only');
  assert.equal(record.vehiculos.invoice_alignment, 'last_only');
  assert.equal(record.vehiculos.fecha_factura_alignment, 'last_only');
  assert.equal(result.decision_evidence.current_snapshot_points_last_only, 1);
  assert.equal(result.decision_evidence.current_snapshot_points_first_only, 0);
});

test('cliente match alone does not determine event alignment in vehiculos', () => {
  const vehiculos = [
    {
      vin_chasis: 'UNRES', factura: 'UNKNOWN', numero_factura: '999', fecha_factura: '12/31/24 0:00',
      cliente: 'FINAL2', vigente: '0', etapa: 'X', pendiente_entrega: '0',
    },
  ];
  const result = calculateVentasUnresolvedRecognitionEvidence(ventasFixture(), [], vehiculos, input);
  const record = result.unresolved_records[0];
  assert.equal(record.vehiculos.cliente_alignment, 'last_only');
  assert.equal(record.vehiculos.event_alignment, 'neither');
  assert.equal(result.decision_evidence.current_snapshot_points_neither, 1);
});

test('an extreme-date tie is reported but tie-break remains technical', () => {
  const ventas = [
    { id: '9', nro_vin_chasis: 'UNRES', fecha_factura: '01/10/22 0:00', cliente: 'A', nro_operacion: 'HIGH', factura: 'H' },
    { id: '2', nro_vin_chasis: 'UNRES', fecha_factura: '01/10/22 0:00', cliente: 'A', nro_operacion: 'LOW', factura: 'L' },
    { id: '3', nro_vin_chasis: 'UNRES', fecha_factura: '03/10/23 0:00', cliente: 'B', nro_operacion: 'LAST', factura: 'LF' },
  ];
  const result = calculateVentasUnresolvedRecognitionEvidence(ventas, [], [], input);
  assert.equal(result.coverage.cross_month_extreme_tie_vins, 1);
  assert.equal(result.unresolved_records[0].first.nro_operacion, 'LOW');
  assert.match(result.warnings[0], /technical tie-break/i);
});
