import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasLongitudinal, parseVentasLongitudinalInput } from '../lib/longitudinal/ventas.js';

const events = [
  { fecha_venta_iso: '2026-01-10T00:00:00Z', tipo_canal: 'CIDEF', sucursal_id: 1, sucursal_nombre: 'BELLAVISTA', eligible_vendedor_cidef: true, persona_id: 10, persona_nombre: 'ANA', marca_id: 1, marca_nombre: 'DONGFENG', modelo_id: 11, modelo_nombre: 'MAGE', version_id: 111, version_nombre: 'LUX' },
  { fecha_venta_iso: '2026-01-15T00:00:00Z', tipo_canal: 'CIDEF', sucursal_id: 1, sucursal_nombre: 'BELLAVISTA', eligible_vendedor_cidef: false, persona_id: 99, persona_nombre: 'ADMIN', marca_id: 1, marca_nombre: 'DONGFENG', modelo_id: 12, modelo_nombre: 'T5', version_id: null, version_nombre: null },
  { fecha_venta_iso: '2026-01-20T00:00:00Z', tipo_canal: 'DEALER', sucursal_id: null, sucursal_nombre: null, dealer_id: 20, dealer_nombre: 'DEALER A', dealer_group_id: 30, dealer_group_nombre: 'GROUP A', eligible_vendedor_cidef: false, marca_id: 2, marca_nombre: 'FOTON', modelo_id: 21, modelo_nombre: 'TM3' },
  { fecha_venta_iso: '2026-03-02T00:00:00Z', tipo_canal: 'CIDEF', sucursal_id: 1, sucursal_nombre: 'BELLAVISTA', eligible_vendedor_cidef: true, persona_id: 10, persona_nombre: 'ANA', marca_id: 1, marca_nombre: 'DONGFENG', modelo_id: 11, modelo_nombre: 'MAGE', version_id: 111, version_nombre: 'LUX' },
];

function parsed(extra = {}) {
  return parseVentasLongitudinalInput({ metric: 'VIN_SALES', grain: 'TOTAL', commercial_universe: 'COMPANY', date_from: '2026-01-01', date_to: '2026-03-31', time_grain: 'MONTH', ...extra });
}

test('monthly total is dense and calculates changes with zero-base guard', () => {
  const result = calculateVentasLongitudinal(events, parsed());
  assert.deepEqual(result.series.map((row) => row.value), [3, 0, 1]);
  assert.equal(result.series[1].absoluteChange, -3);
  assert.equal(result.series[2].pctChange, null);
});

test('filters canonical brand and canonical store inside explicit domains', () => {
  assert.deepEqual(calculateVentasLongitudinal(events, parsed({ filters: { brand: 'DONGFENG' } })).series.map((row) => row.value), [2, 0, 1]);
  assert.deepEqual(calculateVentasLongitudinal(events, parsed({ commercial_universe: 'OWN_STORES', grain: 'STORE', filters: { store_id: 1 } })).series.map((row) => row.value), [2, 0, 1]);
});

test('dealer remains separate from owned store', () => {
  const result = calculateVentasLongitudinal(events.filter((row) => row.tipo_canal === 'DEALER'), parsed({ commercial_universe: 'DEALERS', grain: 'DEALER', filters: { dealer_id: 20 } }));
  assert.deepEqual(result.series.map((row) => row.value), [1, 0, 0]);
});

test('grain cannot redefine or widen the commercial domain', () => {
  assert.throws(() => parsed({ grain: 'STORE' }), /DOMAIN_MISMATCH/);
  assert.throws(() => parsed({ commercial_universe: 'OWN_STORES', grain: 'DEALER' }), /DOMAIN_MISMATCH/);
  assert.throws(() => parseVentasLongitudinalInput({ metric: 'VIN_SALES', grain: 'TOTAL', filters: {}, date_from: '2026-01-01', date_to: '2026-03-31', time_grain: 'MONTH' }), /MISSING_COMMERCIAL_UNIVERSE/);
});

test('seller includes only already-certified date-effective VENDEDOR_CIDEF events', () => {
  const ownEvents = events.filter((row) => row.tipo_canal === 'CIDEF');
  const result = calculateVentasLongitudinal(ownEvents, parsed({ commercial_universe: 'OWN_STORES', grain: 'SELLER', filters: { seller_id: 10 } }));
  assert.deepEqual(result.series.map((row) => row.value), [1, 0, 1]);
  assert.throws(() => parsed({ commercial_universe: 'OWN_STORES', grain: 'SELLER', filters: { channel: 'DEALER' } }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
});

test('model breakdown is exhaustive and reconciles each period', () => {
  const result = calculateVentasLongitudinal(events, parsed({ filters: { brand: 'DONGFENG' }, breakdown: 'MODEL' }));
  for (let i = 0; i < result.series.length; i++) {
    assert.equal(result.seriesByBreakdown.reduce((sum, bucket) => sum + bucket.series[i].value, 0), result.series[i].value);
  }
});

test('share exposes numerator and certified-domain denominator', () => {
  const result = calculateVentasLongitudinal(events, parsed({ metric: 'SHARE_WITHIN_CIDEF', grain: 'BRAND', filters: { brand: 'DONGFENG' } }));
  assert.deepEqual(result.series[0], { period: '2026-01', numerator: 2, denominator: 3, value: 2 / 3, absoluteChange: null, pctChange: null });
});

test('unknown sales filter is rejected', () => assert.throws(() => parsed({ filters: { raw_store: 'Casa Matriz' } }), /UNSUPPORTED_FILTER/));

test('dimension coverage is scoped to requested dates and filters', () => {
  const result = calculateVentasLongitudinal(events, parsed({ date_from: '2026-03-01', filters: { brand: 'DONGFENG' } }));
  assert.equal(result.coverage.dimensionCoverage.find((row) => row.dimension === 'STORE').resolved, 1);
  assert.equal(result.temporalSemantics.lastObservedDate, '2026-03-02');
  assert.ok(result.warnings.includes('LAST_PERIOD_INCOMPLETE'));
});

test('SAME_DAY day 26 truncates every historical month at day 26', () => {
  const sample = [
    ...events,
    { ...events[0], fecha_venta_iso: '2026-01-27T00:00:00Z' },
    { ...events[0], fecha_venta_iso: '2026-02-26T00:00:00Z' },
    { ...events[0], fecha_venta_iso: '2026-02-27T00:00:00Z' },
    { ...events[0], fecha_venta_iso: '2026-03-26T00:00:00Z' },
  ];
  const result = calculateVentasLongitudinal(sample, parsed({ cutoff_mode: 'SAME_DAY', cutoff_date: '2026-03-26' }));
  assert.equal(result.temporalSemantics.comparisonDay, 26);
  assert.equal(result.temporalSemantics.effectiveDateTo, '2026-03-26');
  assert.deepEqual(result.series.map((row) => row.value), [3, 1, 2]);
  assert.match(result.metadata.sameDaySemantics, /not historical recognition-state reconstruction/);
  assert.match(result.metadata.recognition, /LAST-by-VIN/);
});

test('last requested period completeness follows observed evidence', () => {
  const complete = calculateVentasLongitudinal([{ ...events[0], fecha_venta_iso: '2026-02-28T00:00:00Z' }], parsed({ date_from: '2026-02-01', date_to: '2026-02-28' }));
  assert.equal(complete.temporalSemantics.lastPeriodComplete, true);
  const incomplete = calculateVentasLongitudinal(events, parsed());
  assert.equal(incomplete.temporalSemantics.lastPeriodComplete, false);
  assert.ok(incomplete.warnings.includes('REQUESTED_DATE_TO_AFTER_LAST_OBSERVED_DATE'));
});

test('SAME_DAY cutoff 29/30/31 includes real shorter-month days only', () => {
  const february = [{ ...events[0], fecha_venta_iso: '2026-02-28T00:00:00Z' }];
  for (const day of [29, 30, 31]) {
    const result = calculateVentasLongitudinal(february, parsed({ date_from: '2026-02-01', cutoff_mode: 'SAME_DAY', cutoff_date: `2026-03-${day}` }));
    assert.equal(result.series[0].value, 1);
  }
});
