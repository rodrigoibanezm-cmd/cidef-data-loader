import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateIntramonthSalesHistoryContext } from '../lib/motors/intramonth-sales-history-context-v01.js';
import { calculateVentasDailyOrganizationalContext } from '../lib/motors/ventas-daily-organizational-context-v01.js';
import { calculateVentasContext } from '../lib/ventas/buildVentasContext.js';

const NOW = new Date('2026-09-02T12:00:00Z');

function row(id, vin, date, store) {
  return { id, nro_vin_chasis: vin, fecha_factura: date, id_sucursal_vta: store };
}

function maps() {
  return {
    stores: new Map([
      ['10', { canonical_id: '1', nombre_canonico: 'PROPIA A', tipo_canal: 'CIDEF', match_count: 1 }],
      ['20', { canonical_id: '2', nombre_canonico: 'PROPIA B', tipo_canal: 'CIDEF', match_count: 1 }],
      ['30', { canonical_id: '3', nombre_canonico: 'DEALER', tipo_canal: 'DEALER', match_count: 1 }],
    ]),
    sellers: new Map(),
  };
}

function dailyCertified(sourceRows, cutoffDate) {
  const context = calculateVentasContext(sourceRows, { cutoffDate });
  return calculateVentasDailyOrganizationalContext(context, maps(), { cutoffDate });
}

test('closed history matches certified daily context and keeps stores sparse positive', () => {
  const sourceRows = [
    row('1', 'VIN-A', '03/05/2026', '10'),
    row('2', null, '03/10/2026', '10'),
    row('3', 'VIN-A', '03/20/2026', '20'),
    row('4', 'VIN-D', '03/22/2026', '30'),
    row('5', 'VIN-B', '03/31/2026', '10'),
  ];
  const result = calculateIntramonthSalesHistoryContext(
    sourceRows, maps(), { start_month: '2026-03', end_month: '2026-03' }, NOW,
  );

  assert.equal(result.cidef_daily.length, 31);
  for (const cutoff of ['2026-03-01', '2026-03-20', '2026-03-31']) {
    const expected = dailyCertified(sourceRows, cutoff);
    const actual = result.cidef_daily.find((item) => item.cutoff_date === cutoff);
    assert.equal(actual.accumulated_sales, expected.cidef_owned_sales_to_date);
  }
  assert.equal(result.store_daily.some((item) => item.cutoff_date === '2026-03-01'), false);
  assert.equal(result.store_daily.every((item) => item.accumulated_sales > 0), true);
  assert.equal(result.validation.store_rows_sparse_positive, true);
});

test('open month stops at Santiago current date, excludes future evidence and has null labels', () => {
  const sourceRows = [
    row('1', 'VIN-A', '09/01/2026', '10'),
    row('2', 'VIN-A', '09/10/2026', '20'),
    row('3', null, '09/02/2026', '10'),
  ];
  const result = calculateIntramonthSalesHistoryContext(
    sourceRows, maps(), { start_month: '2026-09', end_month: '2026-09' }, NOW,
  );

  assert.deepEqual(result.cidef_daily.map((row) => row.cutoff_date), [
    '2026-09-01', '2026-09-02',
  ]);
  assert.deepEqual(result.cidef_daily.map((row) => row.accumulated_sales), [1, 2]);
  assert.equal(result.cidef_daily.every((row) => row.actual_close == null), true);
  assert.equal(result.store_daily.every((row) => row.actual_close == null), true);
  assert.equal(result.coverage.observable_source_rows, 2);
});

test('calendar emits leap February and closed labels reconcile at month end', () => {
  const result = calculateIntramonthSalesHistoryContext(
    [], maps(), { start_month: '2024-02', end_month: '2024-02' }, NOW,
  );
  assert.equal(result.cidef_daily.length, 29);
  assert.equal(result.cidef_daily.at(-1).cutoff_date, '2024-02-29');
  assert.equal(result.cidef_daily.at(-1).actual_close, 0);
  assert.equal(result.validation.closed_month_end_equals_label, true);
  assert.equal(result.validation.coverage_reconciles, true);
});

test('rejects future months and unsupported inputs', () => {
  assert.throws(
    () => calculateIntramonthSalesHistoryContext(
      [], maps(), { start_month: '2026-10', end_month: '2026-10' }, NOW,
    ),
    /future/,
  );
  assert.throws(
    () => calculateIntramonthSalesHistoryContext(
      [], maps(), { start_month: '2026-03', end_month: '2026-03', grain: 'tienda' }, NOW,
    ),
    /Unsupported input/,
  );
});
