import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasProductDetail } from '../lib/motors/ventas-product-detail-v01.js';
import { calculateVentasProductSales } from '../lib/motors/ventas-product-sales-v01.js';
import { resolveSalesProducts } from '../lib/ventas-product/resolveSaleProduct.js';

const aliases = [
  { modelo_id: 84, version_id: 1, valor_normalizado: 'AEOLUS Y3 MT' },
  { modelo_id: 84, version_id: 2, valor_normalizado: 'AEOLUS Y3 AT COMFORT' },
];

function sale(month, product, sourceId) {
  return {
    source_id: sourceId,
    vin: `VIN-${sourceId}`,
    fecha_venta: `${month}-15`,
    fecha_venta_iso: `${month}-15T00:00:00.000Z`,
    mes_venta: month,
    recognition_basis: 'vin_last_fecha_factura',
    nro_operacion: `OP-${sourceId}`,
    nro_propuesta: `PROP-${sourceId}`,
    factura: `F-${sourceId}`,
    nro_factura: `NF-${sourceId}`,
    producto_sku: null,
    producto: product,
  };
}

function parsed() {
  return { modeloId: 84, startMonth: '2026-01', endMonth: '2026-01', cutoffMonth: '2026-01' };
}

function context(sales, productAliases = aliases) {
  return {
    cutoff_month: '2026-01',
    ventas_validation: { ok: true },
    productAliases,
    resolvedSales: resolveSalesProducts(sales, productAliases),
  };
}

test('detail and aggregate consume the same recognized target sale set', () => {
  const shared = context([
    sale('2026-01', 'AEOLUS Y3 MT', 1),
    sale('2026-01', 'AEOLUS Y3 AT COMFORT', 2),
    sale('2025-12', 'AEOLUS Y3 MT', 3),
  ]);

  const aggregate = calculateVentasProductSales(shared, parsed());
  const detail = calculateVentasProductDetail(shared, parsed());

  assert.equal(aggregate.target.units, 2);
  assert.equal(detail.target.units, aggregate.target.units);
  assert.equal(detail.detail.length, aggregate.target.units);
  assert.equal(detail.validation.detail_units_reconcile_with_target, true);
  assert.deepEqual(detail.detail.map((row) => row.source_id), [1, 2]);
  assert.equal(detail.detail[0].modelo_id, 84);
  assert.equal(detail.detail[0].product_identity_status, 'RESOLVED');
  assert.equal(detail.detail[0].nro_operacion, 'OP-1');
});

test('ambiguous product identity is never exposed as target detail', () => {
  const ambiguousAliases = [
    ...aliases,
    { modelo_id: 99, version_id: 9, valor_normalizado: 'AEOLUS Y3 MT' },
  ];
  const detail = calculateVentasProductDetail(
    context([sale('2026-01', 'AEOLUS Y3 MT', 1)], ambiguousAliases),
    parsed(),
  );

  assert.equal(detail.status, 'warning');
  assert.equal(detail.target.units, 0);
  assert.equal(detail.detail.length, 0);
  assert.equal(detail.validation.no_ambiguous_product_identity, false);
});
