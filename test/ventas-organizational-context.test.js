import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasOrganizationalContext } from '../lib/ventas-org/buildVentasOrganizationalContext.js';

function identityMaps() {
  return {
    stores: new Map([
      ['10 ', { canonical_id: '1', nombre_canonico: 'TIENDA A', match_count: 1 }],
      ['20', { canonical_id: '2', nombre_canonico: 'TIENDA B', match_count: 1 }],
    ]),
    sellers: new Map([
      ['SELLER1', { canonical_id: '101', nombre_canonico: 'UNO', validated: true, match_count: 1 }],
      ['SELLER2', { canonical_id: '102', nombre_canonico: 'DOS', validated: true, match_count: 1 }],
    ]),
  };
}

function ventasContext(recognizedSales, monthlySales) {
  return {
    recognizedSales,
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
  assert.equal(result.validation.seller_monthly_reconciles, false);
  assert.equal(result.validation.ok, false);
});
