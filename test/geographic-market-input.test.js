import test from 'node:test';
import assert from 'node:assert/strict';
import { geographicMarketInput, geographicPeriods } from '../lib/geographic-market-input.js';

test('REGION + ALL applies stable defaults', () => {
  assert.deepEqual(geographicMarketInput({ level: 'REGION', universe: 'ALL' }), {
    level: 'REGION', universe: 'ALL', brand: null, segment: 'TOTAL', months: 12,
    comparison: 'none', end_month: null, page: 1, page_size: 50,
  });
});

test('REGION + CHINA and COMUNA + ALL are closed inputs', () => {
  assert.equal(geographicMarketInput({ level: 'region', universe: 'china' }).universe, 'CHINA');
  assert.equal(geographicMarketInput({ level: 'comuna', universe: 'all' }).level, 'COMUNA');
  assert.throws(() => geographicMarketInput({ universe: 'ALL' }), /level is required/);
  assert.throws(() => geographicMarketInput({ level: 'REGION' }), /universe is required/);
});

test('brand focus, null brand and segment normalization are explicit', () => {
  const focus = geographicMarketInput({
    level: 'REGION', universe: 'ALL', brand: 'foton', segment: 'camioneta',
  });
  assert.equal(focus.brand, 'FOTON');
  assert.equal(focus.segment, 'PICK-UP');
  assert.equal(geographicMarketInput({ level: 'REGION', universe: 'ALL', brand: null }).brand, null);
  assert.equal(geographicMarketInput({ level: 'REGION', universe: 'ALL', segment: 'SUV' }).segment, 'SUV');
});

test('rolling periods are consecutive and non-overlapping', () => {
  const periods = geographicPeriods('2026-07', 6, 'rolling');
  assert.deepEqual(periods.current, { desde: '2026-02', hasta: '2026-07' });
  assert.deepEqual(periods.previous, { desde: '2025-08', hasta: '2026-01' });
});

test('same-period-last-year preserves the month window', () => {
  const periods = geographicPeriods('2026-07', 6, 'same_period_last_year');
  assert.deepEqual(periods.previous, { desde: '2025-02', hasta: '2025-07' });
});

test('historical end month and pagination are validated', () => {
  const input = geographicMarketInput({
    level: 'COMUNA', universe: 'ALL', end_month: '2025-12', page: 2, page_size: 100,
  });
  assert.equal(input.end_month, '2025-12');
  assert.throws(() => geographicMarketInput({ level: 'COMUNA', universe: 'ALL', months: 0 }));
  assert.throws(() => geographicMarketInput({ level: 'COMUNA', universe: 'ALL', page_size: 101 }));
});
