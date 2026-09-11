import test from 'node:test';
import assert from 'node:assert/strict';
import { previousYearPeriod, resolveTemporalIntent } from '../lib/intake-orchestrator/temporal.js';

const FROZEN_NOW = '2026-09-11T09:00:00-03:00';
const options = Object.freeze({ now: FROZEN_NOW, timezone: 'America/Santiago' });

function range(expression, extra = {}) {
  const result = resolveTemporalIntent(expression, { ...options, ...extra });
  return [result.semantic_type, result.date_from, result.date_to, result.time_grain,
    result.complete_period_only, result.period_status];
}

test('last quarter means the last fully closed calendar quarter', () => {
  for (const expression of ['último trimestre', 'trimestre anterior', 'previous quarter']) {
    assert.deepEqual(range(expression), [
      'LAST_CLOSED_CALENDAR_QUARTER', '2026-04-01', '2026-06-30', 'MONTH', true, 'CLOSED',
    ]);
  }
});

test('last 3 months defaults to closed months and differs from last quarter', () => {
  for (const expression of ['últimos 3 meses', 'últimos tres meses', 'last 3 months']) {
    const result = resolveTemporalIntent(expression, options);
    assert.deepEqual([result.semantic_type, result.date_from, result.date_to, result.period_count],
      ['LAST_N_CLOSED_CALENDAR_MONTHS', '2026-06-01', '2026-08-31', 3]);
  }
  assert.deepEqual(range('últimos 3 meses incluyendo este mes'), [
    'ROLLING_CALENDAR_MONTHS_INCLUDING_OPEN', '2026-07-01', '2026-09-11', 'MONTH', false, 'PARTIAL',
  ]);
});

test('current quarter and YTD end at the observable current date and remain partial', () => {
  assert.deepEqual(range('este trimestre'), [
    'CURRENT_CALENDAR_QUARTER_TO_DATE', '2026-07-01', '2026-09-11', 'MONTH', false, 'PARTIAL',
  ]);
  assert.deepEqual(range('YTD'), [
    'YEAR_TO_DATE', '2026-01-01', '2026-09-11', 'MONTH', false, 'PARTIAL',
  ]);
});

test('previous month and last closed month are equivalent', () => {
  assert.deepEqual(range('mes pasado'), [
    'LAST_CLOSED_CALENDAR_MONTH', '2026-08-01', '2026-08-31', 'MONTH', true, 'CLOSED',
  ]);
  assert.deepEqual(range('último mes cerrado'), range('mes pasado'));
});

test('same-day comparison is explicit and preserves the comparable day', () => {
  const result = resolveTemporalIntent('septiembre al mismo día', options);
  assert.equal(result.cutoff_mode, 'SAME_DAY');
  assert.deepEqual([result.date_from, result.date_to], ['2026-09-01', '2026-09-11']);
  assert.deepEqual(result.comparison, {
    semantic_type: 'SAME_PERIOD_PREVIOUS_YEAR',
    date_from: '2025-09-01', date_to: '2025-09-11', time_grain: 'MONTH',
    cutoff_mode: 'SAME_DAY', preserves_base_shape: true,
  });
});

test('same period previous year preserves range shape, including leap-day clamping', () => {
  assert.deepEqual(previousYearPeriod({
    date_from: '2026-06-01', date_to: '2026-08-31', time_grain: 'MONTH', cutoff_mode: 'FULL_PERIOD',
  }), {
    semantic_type: 'SAME_PERIOD_PREVIOUS_YEAR',
    date_from: '2025-06-01', date_to: '2025-08-31', time_grain: 'MONTH',
    cutoff_mode: 'FULL_PERIOD', preserves_base_shape: true,
  });
  assert.equal(previousYearPeriod({ date_from: '2024-02-01', date_to: '2024-02-29' }).date_to, '2023-02-28');
});

test('ambiguous temporal language fails closed', () => {
  const result = resolveTemporalIntent('este último período', options);
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.semantic_type, 'TEMPORAL_AMBIGUOUS');
});

test('calendar boundaries work in January, quarter changes, year changes and leap February', () => {
  const january = { now: '2026-01-15T09:00:00-03:00', timezone: 'America/Santiago' };
  assert.deepEqual(range('último trimestre', january), [
    'LAST_CLOSED_CALENDAR_QUARTER', '2025-10-01', '2025-12-31', 'MONTH', true, 'CLOSED',
  ]);
  assert.deepEqual(range('mes pasado', january), [
    'LAST_CLOSED_CALENDAR_MONTH', '2025-12-01', '2025-12-31', 'MONTH', true, 'CLOSED',
  ]);
  const april = { now: '2026-04-01T09:00:00-03:00', timezone: 'America/Santiago' };
  assert.deepEqual(range('último trimestre', april).slice(0, 3),
    ['LAST_CLOSED_CALENDAR_QUARTER', '2026-01-01', '2026-03-31']);
  const leapMarch = { now: '2024-03-01T09:00:00-03:00', timezone: 'America/Santiago' };
  assert.deepEqual(range('mes pasado', leapMarch).slice(0, 3),
    ['LAST_CLOSED_CALENDAR_MONTH', '2024-02-01', '2024-02-29']);
  const newYear = { now: '2027-01-05T09:00:00-03:00', timezone: 'America/Santiago' };
  assert.deepEqual(range('YTD', newYear).slice(0, 3), ['YEAR_TO_DATE', '2027-01-01', '2027-01-05']);
});
