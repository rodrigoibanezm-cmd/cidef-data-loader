import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveCutoff } from '../lib/current-month-forecast/parseLiveCutoff.js';
import { learnCurrentCompletion } from '../lib/daily-close-forecast/learnCurrentCompletion.js';
import { densifyCurrentStores } from '../lib/current-month-forecast/densifyCurrentStores.js';
import { buildLiveForecast, buildStoreForecasts } from '../lib/current-month-forecast/buildLiveForecast.js';
import { parseFechaFactura } from '../lib/motors/ventas-monthly-dedup-sensitivity-v01.js';
import { findTrainingStartMonth } from '../lib/daily-close-forecast/findTrainingStartMonth.js';
import { calculateCurrentMonthCloseForecast } from '../lib/motors/current-month-close-forecast-v01.js';

test('all 14 real RAW date samples parse and supply training history through August', () => {
  const values = [
    '2020-05-31 00:00:00', '2020-12-31 00:00:00',
    '2021-01-07 00:00:00', '2021-12-31 00:00:00',
    '2022-01-03 00:00:00', '2022-12-31 00:00:00',
    '2023-01-03 00:00:00', '2023-12-31 00:00:00',
    '2024-01-02 00:00:00', '2024-12-31 00:00:00',
    '2025-01-02 00:00:00', '2025-12-31 00:00:00',
    '2026-01-02 00:00:00', '2026-09-11 00:00:00',
  ];
  assert.equal(values.filter(value => !parseFechaFactura(value)?.error).length, 14);
  assert.equal(findTrainingStartMonth(values.map(fecha_factura => ({ fecha_factura })), '2026-08'), '2020-05');
  assert.throws(() => findTrainingStartMonth([{ fecha_factura: values.at(-1) }], '2026-08'), /No parseable ventas history/);
});

test('September forecast builds canonical history without changing legacy forecast results', () => {
  const rows = [];
  for (let month = 1; month <= 9; month += 1) {
    for (const day of [5, 20]) {
      const id = rows.length + 1;
      rows.push({ id, nro_vin_chasis: `VIN-${id}`, id_sucursal_vta: '10',
        fecha_factura: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 00:00:00` });
    }
  }
  const maps = { stores: new Map([['10', {
    canonical_id: 1, nombre_canonico: 'Store A', tipo_canal: 'CIDEF', match_count: 1,
  }]]), sellers: new Map() };
  const roster = [{ sucursal_id: 1, sucursal: 'Store A', tipo_canal: 'CIDEF' }];
  const input = { cutoff_date: '2026-09-12' };
  const now = new Date('2026-09-12T12:00:00Z');
  const result = calculateCurrentMonthCloseForecast(rows, maps, roster, input, now);
  assert.equal(result.historical.backtest_end_month, '2026-08');
  assert.equal(result.cidef_propio.observed_to_date, 1);
  assert.ok(result.cidef_propio.historical_observations > 0);
  assert.equal(result.cidef_propio.forecast_status, 'EVALUABLE');
  assert.equal(result.cidef_propio.forecast_close, 2);
  const legacy = rows.map(row => {
    const [year, month, day] = row.fecha_factura.substring(0, 10).split('-');
    return { ...row, fecha_factura: `${month}/${day}/${year} 0:00:00` };
  });
  assert.deepEqual(result, calculateCurrentMonthCloseForecast(legacy, maps, roster, input, now));
});

test('live cutoff uses commercial month/day and rejects future date and unsupported inputs', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  const first = parseLiveCutoff({ cutoff_date: '2026-09-02' }, now);
  assert.equal(first.targetMonth, '2026-09');
  assert.equal(first.dayOfMonth, 1);
  const close = parseLiveCutoff({ cutoff_date: '2026-10-01' }, now);
  assert.equal(close.targetMonth, '2026-09');
  assert.equal(close.dayOfMonth, 30);
  const next = parseLiveCutoff({ cutoff_date: '2026-10-02' }, now);
  assert.equal(next.targetMonth, '2026-10');
  assert.equal(next.dayOfMonth, 1);
  assert.throws(() => parseLiveCutoff({ cutoff_date: '2026-10-03' }, now), /future/);
  assert.throws(() => parseLiveCutoff({ cutoff_date: '2026-10-02', x: 1 }, now), /Unsupported/);
});

test('shared completion learner uses same commercial day median', () => {
  const learned = learnCurrentCompletion([
    { target_month: '2026-06', day_of_month: 10, observed_to_date: 20, actual_close: 100 },
    { target_month: '2026-07', day_of_month: 10, observed_to_date: 40, actual_close: 100 },
    { target_month: '2026-07', day_of_month: 11, observed_to_date: 90, actual_close: 100 },
  ], 10);
  assert.ok(Math.abs(learned.learned_completion - 0.3) < 1e-12);
  assert.equal(learned.training_observations, 2);
  assert.equal(learned.evaluable, true);
});

test('current CIDEF roster is densified with LIVE_ZERO', () => {
  const roster = [
    { sucursal_id: 1, sucursal: 'Uno', tipo_canal: 'CIDEF' },
    { sucursal_id: 2, sucursal: 'Dos', tipo_canal: 'CIDEF' },
  ];
  const observed = [{ sucursal_id: 1, tipo_canal: 'CIDEF', month_sales_to_date: 4 }];
  assert.deepEqual(densifyCurrentStores(roster, observed), [
    { sucursal_id: 1, sucursal: 'Uno', tipo_canal: 'CIDEF', observed_to_date: 4, observation_semantics: 'POSITIVE_OBSERVED' },
    { sucursal_id: 2, sucursal: 'Dos', tipo_canal: 'CIDEF', observed_to_date: 0, observation_semantics: 'LIVE_ZERO' },
  ]);
});

test('forecast exists before predictability day but is flagged not predictable', () => {
  const row = buildLiveForecast({
    observed: 30,
    learned: { learned_completion: 0.5, training_observations: 20, training_months: 20, evaluable: true },
    predictabilityDay: 22,
    dayOfMonth: 15,
  });
  assert.equal(row.forecast_close, 60);
  assert.equal(row.forecast_status, 'EVALUABLE');
  assert.equal(row.is_predictable, false);
});

test('zero learned completion is NOT_EVALUABLE and LIVE_ZERO can forecast zero', () => {
  const none = buildLiveForecast({
    observed: 3,
    learned: { learned_completion: 0, training_observations: 10, training_months: 10, evaluable: false },
    predictabilityDay: 22,
    dayOfMonth: 10,
  });
  assert.equal(none.forecast_close, null);

  const rows = buildStoreForecasts([
    { sucursal_id: 2, sucursal: 'Dos', observed_to_date: 0, observation_semantics: 'LIVE_ZERO' },
  ], { learned_completion: 0.25, training_observations: 30, training_months: 20, evaluable: true }, 27, 28);
  assert.equal(rows[0].forecast_close, 0);
  assert.equal(rows[0].is_predictable, true);
});
