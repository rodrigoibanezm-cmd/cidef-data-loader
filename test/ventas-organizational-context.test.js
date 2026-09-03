import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasOrganizationalContext } from '../lib/ventas-org/buildVentasOrganizationalContext.js';

function identityMaps() {
  return {
    stores: new Map([
      ['10 ', { canonical_id: '1', nombre_canonico: 'TIENDA A', tipo_canal: 'CIDEF', match_count: 1 }],
      ['20', { canonical_id: '2', nombre_canonico: 'TIENDA B', tipo_canal: 'CIDEF', match_count: 1 }],
    ]),
    sellers: new Map([
      ['SELLER1', { canonical_id: '101', nombre_canonico: 'UNO', validated: true, match_count: 1 }],
      ['SELLER2', { canonical_id: '102', nombre_canonico: 'DOS', validated: true, match_count: 1 }],
    ]),
    vendedorCidef: new Map([
      ['101', [
        { sucursal_id: '1', valid_from: null, valid_to: null, vigente: true },
        { sucursal_id: '2', valid_from: null, valid_to: null, vigente: true },
      ]],
      ['102', [{ sucursal_id: '1', valid_from: null, valid_to: null, vigente: true }]],
    ]),
  };
}

function ventasContext(recognizedSales, monthlySales) {
  return {
    recognizedSales: recognizedSales.map((row) => ({
      fecha_venta_iso: `${row.mes_venta}-15T00:00:00.000Z`,
      ...row,
    })),
    monthlySales,
    validation: { ok: true },
    warnings: [],
  };
}

test('organizational context preserves observed historical store per recognized sale', () => {
  const recognizedSales = [
    { source_id: '1', mes_venta: '2026-01', sucursal_source_key: '10 ', vendedor_source_key: 'SELLER1' },
    { source_id: '2', mes_venta: '2026-01', sucursal_source_key: '10 ', vendedor_source_key: 'SELLER1' },
    { source_id: '3', mes_venta: '2026-01', sucursal_source_key: '10 ', vendedor_source_key: 'SELLER2' },
    { source_id: '4', mes_venta: '2026-01', sucursal_source_key: '20', vendedor_source_key: 'SELLER1' },
    { source_id: '5', mes_venta: '2026-02', sucursal_source_key: '20', vendedor_source_key: 'SELLER1' },
  ];
  const source = ventasContext(recognizedSales, [
    { month: '2026-01', sales: 4 },
    { month: '2026-02', sales: 1 },
  ]);

  const result = calculateVentasOrganizationalContext(
    source, identityMaps(), { startMonth: '2026-01', endMonth: '2026-01' },
  );

  assert.deepEqual(result.cidef_monthly, [{ month: '2026-01', sales: 4 }]);
  assert.equal(result.store_monthly.find((row) => row.sucursal_id === '1').sales, 3);
  assert.equal(result.store_monthly.find((row) => row.sucursal_id === '2').sales, 1);
  assert.equal(result.seller_monthly.find((row) => row.sucursal_id === '1' && row.persona_id === '101').sales, 2);
  assert.equal(result.seller_monthly.find((row) => row.sucursal_id === '2' && row.persona_id === '101').sales, 1);
  assert.equal(result.validation.ok, true);
});

test('identity gaps remain visible and break seller-to-store reconciliation', () => {
  const source = ventasContext([
    { source_id: '1', mes_venta: '2026-01', sucursal_source_key: '20', vendedor_source_key: 'SELLER1' },
    { source_id: '2', mes_venta: '2026-01', sucursal_source_key: '20', vendedor_source_key: 'UNKNOWN' },
  ], [{ month: '2026-01', sales: 2 }]);

  const result = calculateVentasOrganizationalContext(
    source, identityMaps(), { startMonth: '2026-01', endMonth: '2026-01' },
  );

  assert.equal(result.coverage.recognized_sales_total, 2);
  assert.equal(result.coverage.unresolved_seller, 1);
  assert.equal(result.store_monthly[0].sales, 2);
  assert.equal(result.seller_monthly[0].sales, 1);
  assert.equal(result.validation.seller_categories_reconcile, true);
  assert.equal(result.validation.no_out_of_universe_seller, true);
  assert.equal(result.validation.ok, true);
});

test('resolved people outside VENDEDOR_CIDEF never enter seller_monthly', () => {
  const maps = identityMaps();
  maps.sellers.set('ADMIN', {
    canonical_id: '999', nombre_canonico: 'ADMINISTRATIVO', validated: true, match_count: 1,
  });
  const source = ventasContext([
    { source_id: '1', fecha_venta_iso: '2026-01-10T00:00:00.000Z', mes_venta: '2026-01', sucursal_source_key: '20', vendedor_source_key: 'SELLER1' },
    { source_id: '2', fecha_venta_iso: '2026-01-11T00:00:00.000Z', mes_venta: '2026-01', sucursal_source_key: '20', vendedor_source_key: 'ADMIN' },
  ], [{ month: '2026-01', sales: 2 }]);

  const result = calculateVentasOrganizationalContext(
    source, maps, { startMonth: '2026-01', endMonth: '2026-01' },
  );

  assert.equal(result.store_monthly[0].sales, 2);
  assert.equal(result.seller_monthly.length, 1);
  assert.equal(result.seller_monthly[0].persona_id, '101');
  assert.equal(result.coverage.seller_eligible_sales, 1);
  assert.equal(result.coverage.seller_non_eligible_sales, 1);
  assert.equal(result.validation.no_out_of_universe_seller, true);
  assert.equal(result.validation.ok, true);
});

test('VENDEDOR_CIDEF eligibility follows historical reassignment intervals', () => {
  const maps = identityMaps();
  maps.vendedorCidef.set('101', [
    { sucursal_id: '1', valid_from: null, valid_to: '2026-06-30', vigente: false },
    { sucursal_id: '2', valid_from: '2026-07-01', valid_to: null, vigente: true },
  ]);
  const source = ventasContext([
    { source_id: '1', fecha_venta_iso: '2026-06-30T00:00:00.000Z', mes_venta: '2026-06', sucursal_source_key: '10 ', vendedor_source_key: 'SELLER1' },
    { source_id: '2', fecha_venta_iso: '2026-07-01T00:00:00.000Z', mes_venta: '2026-07', sucursal_source_key: '20', vendedor_source_key: 'SELLER1' },
  ], [{ month: '2026-06', sales: 1 }, { month: '2026-07', sales: 1 }]);

  const result = calculateVentasOrganizationalContext(
    source, maps, { startMonth: '2026-06', endMonth: '2026-07' },
  );
  assert.equal(result.seller_monthly.reduce((sum, row) => sum + row.sales, 0), 2);
  assert.ok(result.seller_monthly.every((row) => row.observed_store_assignment_match));
  assert.equal(result.validation.no_out_of_universe_seller, true);
});

test('VENDEDOR_CIDEF never crosses an observed store assignment', () => {
  const maps = identityMaps();
  maps.vendedorCidef.set('101', [
    { sucursal_id: '1', valid_from: null, valid_to: '2026-06-30', vigente: false },
    { sucursal_id: '2', valid_from: '2026-07-01', valid_to: null, vigente: true },
  ]);
  const source = ventasContext([
    { source_id: '1', fecha_venta_iso: '2026-06-15T00:00:00.000Z', mes_venta: '2026-06', sucursal_source_key: '20', vendedor_source_key: 'SELLER1' },
  ], [{ month: '2026-06', sales: 1 }]);
  const result = calculateVentasOrganizationalContext(
    source, maps, { startMonth: '2026-06', endMonth: '2026-06' },
  );
  assert.equal(result.seller_monthly.length, 0);
  assert.deepEqual(result.seller_attribution_monthly, [{
    month: '2026-06', sucursal_id: '2',
    seller_attribution_status: 'VENDEDOR_CIDEF_STORE_MISMATCH', sales: 1,
  }]);
  assert.equal(result.coverage.seller_store_mismatch_sales, 1);
});
