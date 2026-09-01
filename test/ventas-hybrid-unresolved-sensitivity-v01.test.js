import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasHybridUnresolvedSensitivity } from '../lib/motors/ventas-hybrid-unresolved-sensitivity-v01.js';

const input = {
  start_month: '2025-01',
  end_month: '2025-12',
  dominant_first_customers: ['DOM'],
};

test('builds hybrid A/B: resolved cross-month uses LAST and unresolved moves FIRST to LAST', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'RES', fecha_factura: '01/05/25 0:00', cliente: 'DOM' },
    { id: 2, nro_vin_chasis: 'RES', fecha_factura: '02/05/25 0:00', cliente: 'FINAL' },
    { id: 3, nro_vin_chasis: 'UNR', fecha_factura: '03/05/25 0:00', cliente: 'OTHER' },
    { id: 4, nro_vin_chasis: 'UNR', fecha_factura: '04/05/25 0:00', cliente: 'FINAL' },
    { id: 5, nro_vin_chasis: 'SAME', fecha_factura: '05/01/25 0:00', cliente: 'X' },
    { id: 6, nro_vin_chasis: 'SAME', fecha_factura: '05/20/25 0:00', cliente: 'Y' },
    { id: 7, nro_vin_chasis: null, fecha_factura: '06/01/25 0:00', cliente: 'N' },
  ];

  const result = calculateVentasHybridUnresolvedSensitivity(rows, input);
  assert.equal(result.coverage.cross_month_vins, 2);
  assert.equal(result.coverage.resolved_cross_month_vins, 1);
  assert.equal(result.unresolved_vins, 1);
  assert.equal(result.validation.cross_partition_ok, true);
  assert.equal(result.validation.unresolved_transfer_sum_matches, true);

  const jan = result.monthly.find((row) => row.month === '2025-01');
  const feb = result.monthly.find((row) => row.month === '2025-02');
  const mar = result.monthly.find((row) => row.month === '2025-03');
  const apr = result.monthly.find((row) => row.month === '2025-04');
  const may = result.monthly.find((row) => row.month === '2025-05');
  const jun = result.monthly.find((row) => row.month === '2025-06');

  assert.deepEqual([jan.scenario_a, jan.scenario_b], [0, 0]);
  assert.deepEqual([feb.scenario_a, feb.scenario_b], [1, 1]);
  assert.deepEqual([mar.scenario_a, mar.scenario_b], [1, 0]);
  assert.deepEqual([apr.scenario_a, apr.scenario_b], [0, 1]);
  assert.deepEqual([may.scenario_a, may.scenario_b], [1, 1]);
  assert.deepEqual([jun.scenario_a, jun.scenario_b], [1, 1]);
  assert.equal(result.reconciliation.recognized_global_a, result.reconciliation.recognized_global_b);
  assert.equal(result.reconciliation.net_global_difference, 0);
});

test('unresolved transfer matrix is filtered to unresolved VINs only', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'RES', fecha_factura: '01/01/25 0:00', cliente: 'DOM' },
    { id: 2, nro_vin_chasis: 'RES', fecha_factura: '09/01/25 0:00', cliente: 'FINAL' },
    { id: 3, nro_vin_chasis: 'U1', fecha_factura: '02/01/25 0:00', cliente: 'X' },
    { id: 4, nro_vin_chasis: 'U1', fecha_factura: '03/01/25 0:00', cliente: 'Y' },
    { id: 5, nro_vin_chasis: 'U2', fecha_factura: '02/02/25 0:00', cliente: 'Z' },
    { id: 6, nro_vin_chasis: 'U2', fecha_factura: '03/02/25 0:00', cliente: 'W' },
  ];

  const result = calculateVentasHybridUnresolvedSensitivity(rows, input);
  assert.equal(result.unresolved_vins, 2);
  assert.equal(result.unresolved_month_transfers.length, 1);
  assert.equal(result.unresolved_month_transfers[0].from_month, '2025-02');
  assert.equal(result.unresolved_month_transfers[0].to_month, '2025-03');
  assert.equal(result.unresolved_month_transfers[0].vin_count, 2);
  assert.equal(result.validation.unresolved_transfer_sum, 2);
});

test('global reconciliation can hold while requested window totals differ at an edge', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'U', fecha_factura: '12/15/24 0:00', cliente: 'X' },
    { id: 2, nro_vin_chasis: 'U', fecha_factura: '01/15/25 0:00', cliente: 'Y' },
  ];

  const result = calculateVentasHybridUnresolvedSensitivity(rows, {
    start_month: '2025-01',
    end_month: '2025-01',
    dominant_first_customers: ['DOM'],
  });
  assert.equal(result.reconciliation.recognized_global_a, 1);
  assert.equal(result.reconciliation.recognized_global_b, 1);
  assert.equal(result.reconciliation.recognized_window_a, 0);
  assert.equal(result.reconciliation.recognized_window_b, 1);
  assert.equal(result.reconciliation.net_window_difference, 1);
  assert.equal(result.coverage.unresolved_first_outside_window_vins, 1);
});

test('a bad date on a non-null VIN excludes the entire VIN from both scenarios', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'BAD', fecha_factura: 'bad', cliente: 'X' },
    { id: 2, nro_vin_chasis: 'BAD', fecha_factura: '02/01/25 0:00', cliente: 'Y' },
    { id: 3, nro_vin_chasis: null, fecha_factura: '03/01/25 0:00' },
  ];

  const result = calculateVentasHybridUnresolvedSensitivity(rows, input);
  assert.equal(result.coverage.excluded_vins_with_date_errors, 1);
  assert.equal(result.coverage.assignable_non_null_vins, 0);
  assert.equal(result.reconciliation.recognized_global_a, 1);
  assert.equal(result.reconciliation.recognized_global_b, 1);
  assert.equal(result.status, 'warning');
});

test('defaults dominant customer list and date window when omitted', () => {
  const rows = [
    { id: 1, nro_vin_chasis: 'A', fecha_factura: '01/01/25 0:00', cliente: '77050575' },
    { id: 2, nro_vin_chasis: 'A', fecha_factura: '02/01/25 0:00', cliente: 'X' },
  ];
  const result = calculateVentasHybridUnresolvedSensitivity(rows, {});
  assert.equal(result.inputs.start_month, '2021-01');
  assert.equal(result.inputs.end_month, '2026-07');
  assert.deepEqual(result.inputs.dominant_first_customers, ['77050575', '96800910', '96726670']);
  assert.equal(result.coverage.resolved_cross_month_vins, 1);
  assert.equal(result.unresolved_vins, 0);
});
