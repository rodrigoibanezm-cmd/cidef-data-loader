import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSellerChangeContribution } from '../lib/motors/ventas-seller-change-contribution-v01.js';

const parsed = { periodA: '2026-06', periodB: '2026-07', cutoffMonth: '2026-07' };
const store = (month, id, sales, tipo_canal = 'CIDEF') =>
  ({ month, sucursal_id: String(id), tipo_canal, sales });
const seller = (month, storeId, personId, sales) => ({
  month, sucursal_id: String(storeId), persona_id: String(personId), tipo_canal: 'CIDEF',
  sales, temporal_membership_verified: true, observed_store_assignment_match: true,
});
const attribution = (month, storeId, status, sales) => ({
  month, sucursal_id: String(storeId), seller_attribution_status: status, sales,
});

function source({ cidef = [13, 12], sellerRows, attributionRows }) {
  return {
    cutoff_month: '2026-07',
    cidef_monthly: [
      { month: '2026-06', sales: cidef[0] }, { month: '2026-07', sales: cidef[1] },
    ],
    store_monthly: [
      store('2026-06', 1, 8), store('2026-07', 1, 9),
      store('2026-06', 2, 3), store('2026-07', 2, 1), store('2026-06', 99, 1, 'DEALER'),
    ],
    store_identity_monthly: [
      { month: '2026-06', store_identity_status: 'RESUELTA', tipo_canal: 'CIDEF', sales: 11 },
      { month: '2026-06', store_identity_status: 'RESUELTA', tipo_canal: 'DEALER', sales: 1 },
      { month: '2026-06', store_identity_status: 'NO_RESUELTA', tipo_canal: null, sales: 1 },
      { month: '2026-07', store_identity_status: 'RESUELTA', tipo_canal: 'CIDEF', sales: 10 },
      { month: '2026-07', store_identity_status: 'AMBIGUA', tipo_canal: null, sales: 2 },
    ],
    seller_monthly: sellerRows,
    seller_attribution_monthly: attributionRows,
    identity_metadata: {
      stores: [{ sucursal_id: '1', nombre_canonico: 'TIENDA 1', tipo_canal: 'CIDEF' }],
      sellers: [101, 102, 103, 105, 201].map((id) =>
        ({ persona_id: String(id), nombre_canonico: `VENDEDOR ${id}` })),
    },
    coverage: {},
    temporal_evidence: { cutoff_month: '2026-07', recognized_sales_after_cutoff: 0 },
    validation: {
      ventas_context_reconciles: true,
      monthly_cidef_reconciles_with_ventas_context: true,
      no_out_of_universe_seller: true,
      seller_categories_reconcile: true,
    },
  };
}

const sellerRows = [
  seller('2026-06', 1, 101, 3), seller('2026-07', 1, 101, 4),
  seller('2026-06', 1, 102, 2), seller('2026-07', 1, 102, 1),
  seller('2026-06', 1, 103, 1), seller('2026-07', 1, 104, 2),
  seller('2026-06', 1, 105, 1), seller('2026-07', 1, 105, 1),
  seller('2026-06', 2, 201, 2),
];
const attributionRows = [
  attribution('2026-06', 1, 'ELIGIBLE_VENDEDOR_CIDEF', 7),
  attribution('2026-06', 1, 'NO_RESUELTA', 1),
  attribution('2026-07', 1, 'ELIGIBLE_VENDEDOR_CIDEF', 8),
  attribution('2026-07', 1, 'VENDEDOR_CIDEF_STORE_MISMATCH', 1),
  attribution('2026-06', 2, 'ELIGIBLE_VENDEDOR_CIDEF', 2),
  attribution('2026-06', 2, 'RESOLVED_NOT_VENDEDOR_CIDEF', 1),
  attribution('2026-07', 2, 'AMBIGUA', 1),
];

test('reconciles seller to store and store to falling CIDEF with deterministic ranks', () => {
  const result = calculateSellerChangeContribution(source({ sellerRows, attributionRows }), parsed);
  const store1 = result.stores.find((row) => row.sucursal_id === 1);
  assert.deepEqual(store1.sellers.map((row) => row.persona_id), [104, 101, 102, 103, 105]);
  assert.deepEqual(store1.sellers.map((row) => [row.persona_id, row.store_support_rank, row.store_drag_rank]), [
    [104, 1, null], [101, 2, null], [102, null, 1], [103, null, 2], [105, null, null],
  ]);
  assert.equal(store1.sellers.find((row) => row.persona_id === 104).contribution_pct_of_store_delta, 200);
  assert.equal(store1.sellers.find((row) => row.persona_id === 104).contribution_pct_of_cidef_delta, -200);
  assert.equal(store1.sellers.find((row) => row.persona_id === 104).vendedor, null);
  assert.equal(result.stores.find((row) => row.sucursal_id === 2).sucursal, null);
  assert.equal(store1.seller_residual.breakdown.persona_unresolved.sales_period_a, 1);
  assert.equal(store1.seller_residual.breakdown.store_assignment_mismatch.sales_period_b, 1);
  assert.equal(result.stores.find((row) => row.sucursal_id === 2)
    .seller_residual.breakdown.persona_ambiguous.sales_period_b, 1);
  assert.equal(result.organizational_residual.resolved_non_cidef[0].tipo_canal, 'DEALER');
  assert.ok(result.stores.every((row) => row.tipo_canal === 'CIDEF'));
  assert.ok(Object.entries(result.validation).filter(([, value]) => typeof value === 'boolean')
    .every(([, value]) => value));
  assert.ok(result.validation.store_reconciliations.every((row) =>
    row.period_a_reconciles && row.period_b_reconciles && row.delta_reconciles));
});

test('preserves signed contributions when CIDEF and store rise', () => {
  const context = source({ cidef: [12, 14], sellerRows, attributionRows });
  context.store_monthly = [store('2026-06', 1, 10), store('2026-07', 1, 12)];
  context.store_identity_monthly = [
    { month: '2026-06', store_identity_status: 'RESUELTA', tipo_canal: 'CIDEF', sales: 10 },
    { month: '2026-06', store_identity_status: 'NO_RESUELTA', tipo_canal: null, sales: 2 },
    { month: '2026-07', store_identity_status: 'RESUELTA', tipo_canal: 'CIDEF', sales: 12 },
    { month: '2026-07', store_identity_status: 'NO_RESUELTA', tipo_canal: null, sales: 2 },
  ];
  context.seller_monthly = [seller('2026-06', 1, 101, 6), seller('2026-07', 1, 101, 9),
    seller('2026-06', 1, 102, 4), seller('2026-07', 1, 102, 3)];
  context.seller_attribution_monthly = [attribution('2026-06', 1, 'ELIGIBLE_VENDEDOR_CIDEF', 10),
    attribution('2026-07', 1, 'ELIGIBLE_VENDEDOR_CIDEF', 12)];
  const result = calculateSellerChangeContribution(context, parsed);
  assert.equal(result.stores[0].sellers.find((row) => row.persona_id === 101).contribution_pct_of_cidef_delta, 150);
  assert.equal(result.stores[0].sellers.find((row) => row.persona_id === 102).contribution_pct_of_cidef_delta, -50);
  assert.equal(result.validation.ok, true);
});
