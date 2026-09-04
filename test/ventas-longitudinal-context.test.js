import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasLongitudinal, parseVentasLongitudinalInput } from '../lib/longitudinal/ventas.js';

const events = [
  { fecha_venta_iso: '2026-01-10T00:00:00Z', tipo_canal: 'CIDEF', sucursal_id: 1, sucursal_nombre: 'BELLAVISTA', eligible_vendedor_cidef: true, persona_id: 10, persona_nombre: 'ANA', marca_id: 1, marca_nombre: 'DONGFENG', modelo_id: 11, modelo_nombre: 'MAGE', version_id: 111, version_nombre: 'LUX' },
  { fecha_venta_iso: '2026-01-15T00:00:00Z', tipo_canal: 'CIDEF', sucursal_id: 1, sucursal_nombre: 'BELLAVISTA', eligible_vendedor_cidef: false, persona_id: 99, persona_nombre: 'ADMIN', marca_id: 1, marca_nombre: 'DONGFENG', modelo_id: 12, modelo_nombre: 'T5', version_id: null, version_nombre: null },
  { fecha_venta_iso: '2026-01-20T00:00:00Z', tipo_canal: 'DEALER', sucursal_id: 2, sucursal_nombre: 'DEALER STORE', dealer_id: 20, dealer_nombre: 'DEALER A', dealer_group_id: 30, dealer_group_nombre: 'GROUP A', eligible_vendedor_cidef: false, marca_id: 2, marca_nombre: 'FOTON', modelo_id: 21, modelo_nombre: 'TM3' },
  { fecha_venta_iso: '2026-03-02T00:00:00Z', tipo_canal: 'CIDEF', sucursal_id: 1, sucursal_nombre: 'BELLAVISTA', eligible_vendedor_cidef: true, persona_id: 10, persona_nombre: 'ANA', marca_id: 1, marca_nombre: 'DONGFENG', modelo_id: 11, modelo_nombre: 'MAGE', version_id: 111, version_nombre: 'LUX' },
];

function parsed(extra = {}) {
  return parseVentasLongitudinalInput({ metric: 'VIN_SALES', grain: 'TOTAL', date_from: '2026-01-01', date_to: '2026-03-31', time_grain: 'MONTH', ...extra });
}

test('monthly total is dense and calculates changes with zero-base guard', () => {
  const result = calculateVentasLongitudinal(events, parsed());
  assert.deepEqual(result.series.map((row) => row.value), [3, 0, 1]);
  assert.equal(result.series[1].absoluteChange, -3);
  assert.equal(result.series[2].pctChange, null);
});

test('filters canonical brand and canonical store', () => {
  assert.deepEqual(calculateVentasLongitudinal(events, parsed({ filters: { brand: 'DONGFENG' } })).series.map((row) => row.value), [2, 0, 1]);
  assert.deepEqual(calculateVentasLongitudinal(events, parsed({ grain: 'STORE', filters: { store_id: 1 } })).series.map((row) => row.value), [2, 0, 1]);
});

test('dealer remains separate from owned store', () => {
  const result = calculateVentasLongitudinal(events, parsed({ grain: 'DEALER', filters: { dealer_id: 20 } }));
  assert.deepEqual(result.series.map((row) => row.value), [1, 0, 0]);
});

test('seller includes only already-certified date-effective VENDEDOR_CIDEF events', () => {
  const result = calculateVentasLongitudinal(events, parsed({ grain: 'SELLER', filters: { seller_id: 10 } }));
  assert.deepEqual(result.series.map((row) => row.value), [1, 0, 1]);
  assert.throws(() => parsed({ grain: 'SELLER', filters: { channel: 'DEALER' } }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
});

test('model breakdown is exhaustive and reconciles each period', () => {
  const result = calculateVentasLongitudinal(events, parsed({ filters: { brand: 'DONGFENG' }, breakdown: 'MODEL' }));
  for (let i = 0; i < result.series.length; i++) {
    assert.equal(result.seriesByBreakdown.reduce((sum, bucket) => sum + bucket.series[i].value, 0), result.series[i].value);
  }
});

test('share within CIDEF exposes numerator and denominator', () => {
  const result = calculateVentasLongitudinal(events, parsed({ metric: 'SHARE_WITHIN_CIDEF', grain: 'BRAND', filters: { brand: 'DONGFENG' } }));
  assert.deepEqual(result.series[0], { period: '2026-01', numerator: 2, denominator: 3, value: 2 / 3, absoluteChange: null, pctChange: null });
});

test('unknown sales filter is rejected', () => assert.throws(() => parsed({ filters: { raw_store: 'Casa Matriz' } }), /UNSUPPORTED_FILTER/));
