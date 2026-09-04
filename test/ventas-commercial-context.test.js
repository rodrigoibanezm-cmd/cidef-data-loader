import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCommercialUniverse,
  scopeRecognizedSalesToCommercialUniverse,
} from '../lib/ventas-commercial/buildVentasCommercialContext.js';

const recognizedSales = [
  { vin: 'STORE1', fecha_venta_iso: '2026-08-01T00:00:00.000Z' },
  { vin: 'DEALER1', fecha_venta_iso: '2026-08-02T00:00:00.000Z' },
  { vin: 'UNKNOWN1', fecha_venta_iso: '2026-08-03T00:00:00.000Z' },
];
const commercialMap = new Map([
  ['STORE1', { vin: 'STORE1', canal_salida: 'TIENDA_PROPIA', sucursal_venta_id: 7, dealer_id: null, dealer_group_id: null, resolution_status: 'RESOLVED' }],
  ['DEALER1', { vin: 'DEALER1', canal_salida: 'DEALER', sucursal_venta_id: null, dealer_id: 22, dealer_group_id: 4, resolution_status: 'RESOLVED' }],
  ['UNKNOWN1', { vin: 'UNKNOWN1', canal_salida: null, sucursal_venta_id: null, dealer_id: null, dealer_group_id: null, resolution_status: 'UNRESOLVED' }],
]);

test('commercial universe parser only permits certified universes', () => {
  assert.equal(parseCommercialUniverse('own_stores'), 'OWN_STORES');
  assert.throws(() => parseCommercialUniverse('STORE'), /INVALID_COMMERCIAL_UNIVERSE/);
});

test('OWN_STORES never includes dealer sales', () => {
  const result = scopeRecognizedSalesToCommercialUniverse({ recognizedSales, commercialMap, universe: 'OWN_STORES' });
  assert.deepEqual(result.sales.map((row) => row.vin), ['STORE1']);
  assert.equal(result.sales[0].sucursal_venta_id, 7);
  assert.equal(result.sales[0].dealer_id, null);
  assert.equal(result.commercial_scope.universe, 'OWN_STORES');
  assert.equal(result.validation.valid, true);
});

test('DEALERS never includes own-store sales', () => {
  const result = scopeRecognizedSalesToCommercialUniverse({ recognizedSales, commercialMap, universe: 'DEALERS' });
  assert.deepEqual(result.sales.map((row) => row.vin), ['DEALER1']);
  assert.equal(result.sales[0].sucursal_venta_id, null);
  assert.equal(result.sales[0].dealer_id, 22);
  assert.equal(result.validation.valid, true);
});

test('COMPANY preserves unresolved channel as explicit residual', () => {
  const result = scopeRecognizedSalesToCommercialUniverse({ recognizedSales, commercialMap, universe: 'COMPANY' });
  assert.equal(result.sales.length, 3);
  assert.equal(result.coverage.unresolved_channel, 1);
  assert.equal(result.coverage.included_sales, 3);
});

test('scopes can be narrowed but not relabeled by the scoper', () => {
  const own = scopeRecognizedSalesToCommercialUniverse({ recognizedSales, commercialMap, universe: 'OWN_STORES' });
  assert.ok(own.sales.every((row) => row.commercial_universe === 'OWN_STORES'));
  assert.ok(own.sales.every((row) => row.canonical_commercial_universe === 'OWN_STORES'));
});
