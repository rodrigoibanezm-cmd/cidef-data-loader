import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVentasDailyOrganizationalContext } from '../lib/motors/ventas-daily-organizational-context-v01.js';

function maps() {
  return {
    stores: new Map([
      ['10', { canonical_id: '1', nombre_canonico: 'PROPIA A', tipo_canal: 'CIDEF', match_count: 1 }],
      ['20', { canonical_id: '2', nombre_canonico: 'DEALER A', tipo_canal: 'DEALER', match_count: 1 }],
      ['30', { canonical_id: '3', nombre_canonico: 'PROPIA SIN VENTA', tipo_canal: 'CIDEF', match_count: 1 }],
      ['40', { canonical_id: '4', nombre_canonico: 'AMBIGUA', tipo_canal: 'CIDEF', match_count: 2 }],
    ]),
    sellers: new Map(),
  };
}

function context() {
  return {
    cutoff_date: '2026-04-15',
    recognizedSales: [
      { source_id: '1', mes_venta: '2026-03', sucursal_source_key: '10' },
      { source_id: '2', mes_venta: '2026-04', sucursal_source_key: '10' },
      { source_id: '3', mes_venta: '2026-04', sucursal_source_key: '10' },
      { source_id: '4', mes_venta: '2026-04', sucursal_source_key: '20' },
      { source_id: '5', mes_venta: '2026-04', sucursal_source_key: '999' },
      { source_id: '6', mes_venta: '2026-04', sucursal_source_key: '40' },
    ],
    validation: { ok: true },
    warnings: [],
  };
}

test('reconciles target-month recognized sales by store identity and channel', () => {
  const result = calculateVentasDailyOrganizationalContext(
    context(), maps(), { cutoffDate: '2026-04-15' },
  );

  assert.equal(result.coverage.recognized_sales_in_target_month_to_date, 5);
  assert.equal(result.coverage.resolved_store, 3);
  assert.equal(result.coverage.unresolved_store, 1);
  assert.equal(result.coverage.ambiguous_store, 1);
  assert.equal(result.coverage.resolved_sales_by_channel.CIDEF, 2);
  assert.equal(result.coverage.resolved_sales_by_channel.DEALER, 1);
  assert.equal(result.cidef_owned_sales_to_date, 2);
  assert.equal(result.validation.store_reconciles_with_recognized_target_month, true);
  assert.equal(result.validation.resolved_channels_reconcile, true);
  assert.equal(result.validation.cidef_owned_reconciles, true);
});

test('keeps sparse positive stores and never fabricates zero rows', () => {
  const result = calculateVentasDailyOrganizationalContext(
    context(), maps(), { cutoffDate: '2026-04-15' },
  );

  assert.equal(result.store_sales_to_date.length, 2);
  assert.equal(result.store_sales_to_date.some((row) => row.sucursal_id === '3'), false);
  assert.deepEqual(result.store_sales_to_date.map((row) => row.month_sales_to_date), [2, 1]);
});

test('reports ambiguous MASTER source keys as validation warning', () => {
  const result = calculateVentasDailyOrganizationalContext(
    context(), maps(), { cutoffDate: '2026-04-15' },
  );

  assert.equal(result.validation.store_identity_keys_unique, false);
  assert.equal(result.status, 'warning');
});
