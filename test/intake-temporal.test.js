import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveTemporalMetadata, previousYearPeriod } from '../lib/temporal/periodMath.js';

const options = Object.freeze({ now: '2026-09-11T09:00:00-03:00', timezone: 'America/Santiago' });
const derive = (date_from, date_to, extra = {}) => deriveTemporalMetadata({ date_from, date_to }, { ...options, ...extra });

test('previous closed calendar quarter is derived from dates', () => {
  const result = derive('2026-04-01', '2026-06-30');
  assert.deepEqual([result.type, result.date_from, result.date_to, result.period_status, result.cutoff_mode],
    ['LAST_CLOSED_QUARTER', '2026-04-01', '2026-06-30', 'CLOSED', 'FULL_PERIOD']);
});

test('last three closed months remain a multi-month range', () => {
  const result = derive('2026-06-01', '2026-08-31');
  assert.deepEqual([result.type, result.date_from, result.date_to, result.calendar_shape.full_calendar_months],
    ['LAST_N_CLOSED_MONTHS', '2026-06-01', '2026-08-31', 3]);
});

test('current quarter and YTD end at current date and remain partial', () => {
  const quarter = derive('2026-07-01', '2026-09-11');
  assert.deepEqual([quarter.type, quarter.period_status, quarter.cutoff_mode], ['CURRENT_QUARTER_TO_DATE', 'PARTIAL', 'SAME_DAY']);
  const ytd = derive('2026-01-01', '2026-09-11');
  assert.deepEqual([ytd.type, ytd.period_status, ytd.cutoff_mode], ['YTD', 'PARTIAL', 'SAME_DAY']);
});

test('previous month is classified deterministically', () => {
  const result = derive('2026-08-01', '2026-08-31');
  assert.equal(result.type, 'LAST_CLOSED_MONTH');
});

test('older full month is explicit rather than mislabeled as last month', () => {
  const result = derive('2026-06-01', '2026-06-30');
  assert.equal(result.type, 'EXPLICIT_MONTH');
});

test('previous-year range preserves shape including leap-day clamping', () => {
  assert.deepEqual(previousYearPeriod({ date_from:'2026-06-01', date_to:'2026-08-31' }),
    { date_from:'2025-06-01', date_to:'2025-08-31' });
  assert.equal(previousYearPeriod({ date_from:'2024-02-01', date_to:'2024-02-29' }).date_to, '2023-02-28');
});

test('calendar boundaries work across year, quarter and leap February', () => {
  const january = { now:'2026-01-15T09:00:00-03:00', timezone:'America/Santiago' };
  assert.equal(deriveTemporalMetadata({ date_from:'2025-10-01', date_to:'2025-12-31' }, january).type, 'LAST_CLOSED_QUARTER');
  assert.equal(deriveTemporalMetadata({ date_from:'2025-12-01', date_to:'2025-12-31' }, january).type, 'LAST_CLOSED_MONTH');
  const leapMarch = { now:'2024-03-01T09:00:00-03:00', timezone:'America/Santiago' };
  assert.equal(deriveTemporalMetadata({ date_from:'2024-02-01', date_to:'2024-02-29' }, leapMarch).type, 'LAST_CLOSED_MONTH');
});
