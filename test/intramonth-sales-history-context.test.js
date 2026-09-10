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

test('default output is one monthly row with configurable milestone ratios and factors', () => {
  const sourceRows = [
    row('1', 'VIN-A', '03/05/2026', '10'),
    row('2', 'VIN-B', '03/19/2026', '10'),
    row('3', 'VIN-C', '03/21/2026', '20'),
    row('4', 'VIN-D', '03/27/2026', '10'),
    row('5', 'VIN-E', '03/31/2026', '30'),
  ];
  const result = calculateIntramonthSalesHistoryContext(
    sourceRows,
    maps(),
    { start_month: '2026-03', end_month: '2026-03', milestone_days: [18, 20, 25] },
    NOW,
  );

  assert.equal(result.inputs.output_mode, 'MONTHLY_MILESTONES');
  assert.equal(result.monthly.length, 1);
  assert.equal(result.monthly[0].month, '2026-03');
  assert.equal(result.monthly[0].final_vin, 4);
  assert.equal(result.monthly[0].vin_d18, 2);
  assert.equal(result.monthly[0].ratio_d18, 0.5);
  assert.equal(result.monthly[0].factor_close_d18, 2);
  assert.equal(result.monthly[0].vin_d20, 3);
  assert.equal(result.monthly[0].vin_d25, 3);
  assert.equal(result.validation.milestone_never_exceeds_close, true);
  assert.equal(result.validation.ratios_bounded_0_1, true);
  assert.equal('cidef_daily' in result, false);
  assert.equal('store_daily' in result, false);
});

test('DAILY compatibility mode preserves certified daily and sparse store detail', () => {
  const sourceRows = [
    row('1', 'VIN-A', '03/05/2026', '10'),
    row('2', null, '03/10/2026', '10'),
    row('3', 'VIN-A', '03/20/2026', '20'),
    row('4', 'VIN-D', '03/22/2026', '30'),
    row('5', 'VIN-B', '03/31/2026', '10'),
  ];
  const result = calculateIntramonthSalesHistoryContext(
    sourceRows,
    maps(),
    { start_month: '2026-03', end_month: '2026-03', output_mode: 'DAILY' },
    NOW,
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

test('open commercial month is excluded from close-history evaluation', () => {
  const sourceRows = [
    row('1', 'VIN-A', '09/01/2026', '10'),
    row('2', 'VIN-A', '09/10/2026', '20'),
    row('3', null, '09/02/2026', '10'),
  ];
  const result = calculateIntramonthSalesHistoryContext(
    sourceRows, maps(), { start_month: '2026-09', end_month: '2026-09' }, NOW,
  );

  assert.deepEqual(result.monthly, []);
  assert.deepEqual(result.evaluation_exclusions, [{ month: '2026-09', reason: 'OPEN_COMMERCIAL_MONTH' }]);
  assert.equal(result.coverage.observable_source_rows, 2);
  assert.equal(result.coverage.months_evaluable, 0);
});

test('28, 29, 30 and 31-day commercial months reconcile their last day in DAILY mode', () => {
  const cases = [
    ['2025-02', 28, '2025-03-01'],
    ['2024-02', 29, '2024-03-01'],
    ['2026-04', 30, '2026-05-01'],
    ['2026-05', 31, '2026-06-01'],
  ];

  for (const [month, days, finalDate] of cases) {
    const result = calculateIntramonthSalesHistoryContext(
      [], maps(), { start_month: month, end_month: month, output_mode: 'DAILY' }, NOW,
    );
    assert.equal(result.cidef_daily.length, days);
    assert.equal(result.cidef_daily.at(-1).cutoff_date, finalDate);
    assert.equal(result.cidef_daily.at(-1).actual_close, 0);
    assert.equal(result.validation.closed_month_end_equals_label, true);
  }
});

test('zero-sale closed month is returned but excluded from ratio evaluation', () => {
  const result = calculateIntramonthSalesHistoryContext(
    [], maps(), { start_month: '2024-02', end_month: '2024-02', milestone_days: [20] }, NOW,
  );
  assert.equal(result.monthly.length, 1);
  assert.equal(result.monthly[0].final_vin, 0);
  assert.equal(result.monthly[0].vin_d20, 0);
  assert.equal(result.monthly[0].ratio_d20, null);
  assert.equal(result.monthly[0].factor_close_d20, null);
  assert.equal(result.monthly[0].evaluable, false);
  assert.deepEqual(result.evaluation_exclusions, [{ month: '2024-02', reason: 'ZERO_FINAL_VIN' }]);
});

test('rejects future months, unsupported inputs and invalid milestone configuration', () => {
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
  assert.throws(
    () => calculateIntramonthSalesHistoryContext(
      [], maps(), { start_month: '2026-03', end_month: '2026-03', milestone_days: [0, 32] }, NOW,
    ),
    /milestone_days/,
  );
});
