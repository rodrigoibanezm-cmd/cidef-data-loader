import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasProductSales } from '../lib/motors/ventas-product-sales-v01.js';
import { resolveSalesProducts } from '../lib/ventas-product/resolveSaleProduct.js';

const aliases = [
  { modelo_id: 84, version_id: 1, valor_normalizado: 'AEOLUS Y3 MT' },
  { modelo_id: 84, version_id: 2, valor_normalizado: 'AEOLUS Y3 AT COMFORT' },
];

function sale(month, product) {
  return { mes_venta: month, producto_sku: null, producto: product };
}

function parsed() {
  return { modeloId: 84, startMonth: '2026-01', endMonth: '2026-07', cutoffMonth: '2026-07' };
}

test('resolves MASTER aliases and aggregates target modelo_id inside period', () => {
  const resolvedSales = resolveSalesProducts([
    sale('2026-01', 'AEOLUS Y3 MT'),
    sale('2026-07', 'AEOLUS Y3 AT COMFORT'),
    sale('2025-12', 'AEOLUS Y3 MT'),
  ], aliases);
  const result = calculateVentasProductSales({
    cutoff_month: '2026-07',
    ventas_validation: { ok: true },
    productAliases: aliases,
    resolvedSales,
  }, parsed());

  assert.equal(result.status, 'ok');
  assert.equal(result.target.modelo_id, 84);
  assert.equal(result.target.units, 2);
  assert.deepEqual(result.target.monthly_sales, [
    { month: '2026-01', sales: 1 },
    { month: '2026-07', sales: 1 },
  ]);
});

test('does not silently resolve a raw alias that maps to multiple models', () => {
  const ambiguousAliases = [
    ...aliases,
    { modelo_id: 99, version_id: 9, valor_normalizado: 'AEOLUS Y3 MT' },
  ];
  const resolvedSales = resolveSalesProducts([sale('2026-07', 'AEOLUS Y3 MT')], ambiguousAliases);
  const result = calculateVentasProductSales({
    cutoff_month: '2026-07',
    ventas_validation: { ok: true },
    productAliases: ambiguousAliases,
    resolvedSales,
  }, parsed());

  assert.equal(result.status, 'warning');
  assert.equal(result.target.units, 0);
  assert.equal(result.validation.no_ambiguous_product_identity, false);
});
