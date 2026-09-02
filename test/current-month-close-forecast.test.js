import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveCutoff } from '../lib/current-month-forecast/parseLiveCutoff.js';
import { learnHistoricalCompletion } from '../lib/current-month-forecast/learnHistoricalCompletion.js';
import { densifyCurrentStores } from '../lib/current-month-forecast/densifyCurrentStores.js';
import { buildLiveForecast, buildStoreForecasts } from '../lib/current-month-forecast/buildLiveForecast.js';

test('live cutoff rejects future date and unsupported inputs', () => {
  const now = new Date('2026-09-02T12:00:00Z');
  assert.equal(parseLiveCutoff({ cutoff_date: '2026-09-02' }, now).dayOfMonth, 2);
  assert.throws(() => parseLiveCutoff({ cutoff_date: '2026-09-03' }, now), /future/);
  assert.throws(() => parseLiveCutoff({ cutoff_date: '2026-09-02', x: 1 }, now), /Unsupported/);
});

test('historical completion uses same calendar day median', () => {
  const learned = learnHistoricalCompletion([
    { day_of_month: 10, observed_to_date: 20, actual_close: 100 },
    { day_of_month: 10, observed_to_date: 40, actual_close: 100 },
    { day_of_month: 11, observed_to_date: 90, actual_close: 100 },
  ], 10);
  assert.equal(learned.learned_completion, 0.3);
  assert.equal(learned.historical_observations, 2);
  assert.equal(learned.ratios_in_bounds, true);
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
    learned: { learned_completion: 0.5, historical_observations: 20 },
    predictabilityDay: 22,
    dayOfMonth: 15,
  });
  assert.equal(row.forecast_close, 60);
  assert.equal(row.forecast_status, 'EVALUABLE');
  assert.equal(row.is_predictable, false);
});

test('zero learned completion is NOT_EVALUABLE and store zero forecasts to zero when evaluable', () => {
  const none = buildLiveForecast({
    observed: 3,
    learned: { learned_completion: 0, historical_observations: 10 },
    predictabilityDay: 22,
    dayOfMonth: 10,
  });
  assert.equal(none.forecast_close, null);
  assert.equal(none.forecast_status, 'NOT_EVALUABLE');

  const rows = buildStoreForecasts([
    { sucursal_id: 2, sucursal: 'Dos', observed_to_date: 0, observation_semantics: 'LIVE_ZERO' },
  ], { learned_completion: 0.25, historical_observations: 30 }, 27, 28);
  assert.equal(rows[0].forecast_close, 0);
  assert.equal(rows[0].is_predictable, true);
});
