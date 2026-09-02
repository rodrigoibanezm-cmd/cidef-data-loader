import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDailyCloseBacktestContext } from '../lib/motors/daily-close-backtest-context-v01.js';
import { calculateVentasDailyOrganizationalContext } from '../lib/motors/ventas-daily-organizational-context-v01.js';
import { calculateVentasContext } from '../lib/ventas/buildVentasContext.js';

const NOW = new Date('2026-09-02T00:00:00Z');

function row(id, vin, date, store) {
  return { id, nro_vin_chasis: vin, fecha_factura: date, id_sucursal_vta: store };
}

function maps() {
  return {
    stores: new Map([
      ['10', { canonical_id: '1', nombre_canonico: 'PROPIA A', tipo_canal: 'CIDEF', match_count: 1 }],
      ['20', { canonical_id: '2', nombre_canonico: 'PROPIA B', tipo_canal: 'CIDEF', match_count: 1 }],
      ['30', { canonical_id: '3', nombre_canonico: 'DEALER A', tipo_canal: 'DEALER', match_count: 1 }],
    ]),
    sellers: new Map(),
  };
}

function rows() {
  return [
    row('1', 'VIN-A', '03/05/2026', '10'),
    row('2', null, '03/10/2026', '10'),
    row('3', 'VIN-A', '03/20/2026', '20'),
    row('4', 'VIN-D', '03/22/2026', '30'),
    row('5', 'VIN-B', '03/31/2026', '10'),
    row('6', 'VIN-A', '04/10/2026', '20'),
    row('7', null, '04/15/2026', '10'),
    row('8', 'VIN-C', '04/30/2026', '10'),
    row('10', 'VIN-T', '04/30/2026 12:00:00', '10'),
    row('9', 'VIN-T', '04/30/2026 12:00:00', '20'),
  ];
}

function dailyCertified(sourceRows, identityMaps, cutoffDate) {
  const context = calculateVentasContext(sourceRows, { cutoffDate });
  return calculateVentasDailyOrganizationalContext(context, identityMaps, { cutoffDate });
}

test('matches certified daily organizational context at selected cutoffs', () => {
  const sourceRows = rows();
  const identityMaps = maps();
  const result = calculateDailyCloseBacktestContext(
    sourceRows, identityMaps, { start_month: '2026-03', end_month: '2026-04' }, NOW,
  );

  for (const cutoff of ['2026-03-20', '2026-04-30']) {
    const expected = dailyCertified(sourceRows, identityMaps, cutoff);
    const actual = result.company_observations.find((item) => item.cutoff_date === cutoff);
    assert.equal(actual.observed_to_date, expected.cidef_owned_sales_to_date);
  }
  assert.equal(result.coverage.tie_groups_resolved, 1);
});

test('emits certified zeros only for positive month-end CIDEF store cohorts', () => {
  const result = calculateDailyCloseBacktestContext(
    rows(), maps(), { start_month: '2026-03', end_month: '2026-04' }, NOW,
  );
  const zero = result.store_observations.find(
    (item) => item.target_month === '2026-03' && item.day_of_month === 1 && item.sucursal_id === '2',
  );
  assert.equal(zero.observed_to_date, 0);
  assert.equal(zero.actual_close, 1);
  assert.equal(zero.observation_semantics, 'CERTIFIED_ZERO');
  assert.equal(result.store_observations.some((item) => item.sucursal_id === '3'), false);
  assert.equal(result.validation.company_month_end_equals_close, true);
  assert.equal(result.validation.store_month_end_equals_close, true);
});

test('does not clamp non-monotone store history when observed exceeds final close', () => {
  const sourceRows = [
    row('1', 'VIN-X', '03/01/2026', '10'),
    row('2', 'VIN-Y', '03/01/2026', '10'),
    row('3', 'VIN-X', '03/20/2026', '20'),
  ];
  const result = calculateDailyCloseBacktestContext(
    sourceRows, maps(), { start_month: '2026-03', end_month: '2026-03' }, NOW,
  );
  assert.equal(result.validation.store_observed_le_actual, false);
  assert.equal(result.status, 'warning');
});

test('rejects an open end month', () => {
  assert.throws(
    () => calculateDailyCloseBacktestContext([], maps(), { start_month: '2026-09', end_month: '2026-09' }, NOW),
    /closed month/,
  );
});
