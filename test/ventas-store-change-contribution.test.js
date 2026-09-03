import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStoreChangeContribution } from '../lib/motors/ventas-store-change-contribution-v01.js';

const parsed = { periodA: '2026-06', periodB: '2026-07', cutoffMonth: '2026-07' };
const store = (month, id, sales, channel = 'CIDEF') => ({
  month, sucursal_id: String(id), tipo_canal: channel, sales,
});
const identity = (month, status, channel, sales) => ({
  month, store_identity_status: status, tipo_canal: channel, sales,
});

function context(cidef, stores, identities, metadata = []) {
  return {
    cutoff_month: '2026-07',
    cidef_monthly: [
      { month: '2026-06', sales: cidef[0] }, { month: '2026-07', sales: cidef[1] },
    ],
    store_monthly: stores,
    store_identity_monthly: identities,
    identity_metadata: { stores: metadata },
    coverage: { recognized_sales_total: cidef[0] + cidef[1] },
    temporal_evidence: { cutoff_month: '2026-07', recognized_sales_after_cutoff: 0 },
    validation: { ventas_context_reconciles: true, monthly_cidef_reconciles_with_ventas_context: true },
  };
}

test('reconciles stores and organizational residual for rising CIDEF', () => {
  const result = calculateStoreChangeContribution(context(
    [10, 11],
    [
      store('2026-06', 1, 2), store('2026-06', 2, 2), store('2026-06', 4, 1),
      store('2026-06', 5, 1), store('2026-06', 99, 1, 'DEALER'),
      store('2026-07', 1, 5), store('2026-07', 2, 1), store('2026-07', 3, 2),
      store('2026-07', 4, 1), store('2026-08', 1, 99),
    ],
    [
      identity('2026-06', 'RESUELTA', 'CIDEF', 6),
      identity('2026-06', 'RESUELTA', 'DEALER', 1),
      identity('2026-06', 'NO_RESUELTA', null, 2),
      identity('2026-06', 'AMBIGUA', null, 1),
      identity('2026-07', 'RESUELTA', 'CIDEF', 9),
      identity('2026-07', 'AMBIGUA', null, 2),
    ],
    [1, 2, 4, 5, 99].map((id) => ({
      sucursal_id: String(id), nombre_canonico: `TIENDA ${id}`, tipo_canal: id === 99 ? 'DEALER' : 'CIDEF',
    })),
  ), parsed);

  assert.deepEqual(result.cidef, { period_a_sales: 10, period_b_sales: 11, delta_sales: 1 });
  assert.deepEqual(result.stores.map((row) => [row.sucursal_id, row.sales_period_a, row.sales_period_b]), [
    [1, 2, 5], [3, 0, 2], [2, 2, 1], [5, 1, 0], [4, 1, 1],
  ]);
  assert.deepEqual(result.stores.map((row) => [row.sucursal_id, row.support_rank, row.drag_rank]), [
    [1, 1, null], [3, 2, null], [2, null, 1], [5, null, 2], [4, null, null],
  ]);
  assert.equal(result.stores[0].contribution_pct_of_cidef_delta, 300);
  assert.equal(result.stores.find((row) => row.sucursal_id === 2).contribution_pct_of_cidef_delta, -100);
  assert.deepEqual(result.organizational_residual.unresolved_store,
    { sales_period_a: 2, sales_period_b: 0, delta_sales: -2 });
  assert.deepEqual(result.organizational_residual.ambiguous_store,
    { sales_period_a: 1, sales_period_b: 2, delta_sales: 1 });
  assert.deepEqual(result.organizational_residual.resolved_non_cidef,
    [{ tipo_canal: 'DEALER', sales_period_a: 1, sales_period_b: 0, delta_sales: -1 }]);
  assert.deepEqual(result.organizational_residual.total,
    { sales_period_a: 4, sales_period_b: 2, delta_sales: -2 });
  assert.equal(result.stores.find((row) => row.sucursal_id === 3).sucursal, null);
  assert.deepEqual(result.coverage.missing_store_metadata_ids, [3]);
  assert.ok(Object.values(result.validation).every(Boolean));
});

test('DEALER never enters stores and remains in residual', () => {
  const result = calculateStoreChangeContribution(context(
    [2, 1],
    [store('2026-06', 1, 1), store('2026-06', 99, 1, 'DEALER'), store('2026-07', 1, 1)],
    [identity('2026-06', 'RESUELTA', 'CIDEF', 1), identity('2026-06', 'RESUELTA', 'DEALER', 1),
      identity('2026-07', 'RESUELTA', 'CIDEF', 1)],
    [{ sucursal_id: '1', nombre_canonico: 'PROPIA', tipo_canal: 'CIDEF' }],
  ), parsed);
  assert.deepEqual(result.stores.map((row) => row.sucursal_id), [1]);
  assert.equal(result.organizational_residual.resolved_non_cidef[0].tipo_canal, 'DEALER');
  assert.equal(result.validation.dealers_excluded_from_stores, true);
});

test('supports falling and zero CIDEF deltas without changing sign semantics', () => {
  const falling = calculateStoreChangeContribution(context(
    [7, 5],
    [store('2026-06', 1, 2), store('2026-06', 2, 5), store('2026-07', 1, 3), store('2026-07', 2, 2)],
    [identity('2026-06', 'RESUELTA', 'CIDEF', 7), identity('2026-07', 'RESUELTA', 'CIDEF', 5)],
  ), parsed);
  assert.equal(falling.stores.find((row) => row.sucursal_id === 1).contribution_pct_of_cidef_delta, -50);
  assert.equal(falling.stores.find((row) => row.sucursal_id === 2).contribution_pct_of_cidef_delta, 150);

  const zero = calculateStoreChangeContribution(context(
    [4, 4],
    [store('2026-06', 1, 1), store('2026-06', 2, 3), store('2026-07', 1, 3), store('2026-07', 2, 1)],
    [identity('2026-06', 'RESUELTA', 'CIDEF', 4), identity('2026-07', 'RESUELTA', 'CIDEF', 4)],
  ), parsed);
  assert.ok(zero.stores.every((row) => row.contribution_pct_of_cidef_delta === null));
});
