import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commercialDateForDay,
  commercialDayForDate,
  commercialMonthDays,
  commercialMonthForDate,
  commercialMonthRange,
} from '../lib/ventas/commercialMonth.js';

test('commercial month runs from day 02 through next month day 01', () => {
  assert.equal(commercialMonthForDate('2026-09-02'), '2026-09');
  assert.equal(commercialDayForDate('2026-09-02'), 1);
  assert.equal(commercialMonthForDate('2026-09-30'), '2026-09');
  assert.equal(commercialDayForDate('2026-09-30'), 29);
  assert.equal(commercialMonthForDate('2026-10-01'), '2026-09');
  assert.equal(commercialDayForDate('2026-10-01'), 30);
  assert.equal(commercialMonthForDate('2026-10-02'), '2026-10');
  assert.equal(commercialDayForDate('2026-10-02'), 1);
  assert.deepEqual(
    { start: commercialMonthRange('2026-09').start_date, end: commercialMonthRange('2026-09').end_date },
    { start: '2026-09-02', end: '2026-10-01' },
  );
});

test('commercial calendar preserves origin month length including leap February', () => {
  assert.equal(commercialMonthDays('2026-02'), 28);
  assert.equal(commercialDateForDay('2026-02', 28), '2026-03-01');
  assert.equal(commercialMonthDays('2028-02'), 29);
  assert.equal(commercialDateForDay('2028-02', 29), '2028-03-01');
});

test('day 01 crosses year boundary into previous commercial month', () => {
  assert.equal(commercialMonthForDate('2027-01-01'), '2026-12');
  assert.equal(commercialDayForDate('2027-01-01'), 31);
  assert.equal(commercialDateForDay('2026-12', 31), '2027-01-01');
});
