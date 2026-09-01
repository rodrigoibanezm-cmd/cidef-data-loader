import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleIdentityCoverage } from '../lib/ventas-identity/assembleIdentityCoverage.js';

test('identity coverage reconciles and computes row coverage', () => {
  const result = assembleIdentityCoverage({
    rows_total: 100,
    rows_store_resolved: 100,
    rows_store_unresolved: 0,
    rows_store_ambiguous: 0,
    rows_seller_resolved: 98,
    rows_seller_unresolved: 2,
    rows_seller_ambiguous: 0,
    rows_both_resolved: 98,
    rows_seller_unvalidated: 3,
    distinct_store_keys: 22,
    distinct_seller_keys: 90,
    store_unresolved: null,
    seller_unresolved: ['OLDUSER'],
  });

  assert.equal(result.coverage.store.pct, 100);
  assert.equal(result.coverage.seller.pct, 98);
  assert.equal(result.coverage.both.pct, 98);
  assert.deepEqual(result.unresolved.sellers, ['OLDUSER']);
  assert.equal(result.validation.ok, true);
  assert.equal(result.warnings.length, 2);
});

test('identity coverage flags ambiguous MASTER keys', () => {
  const result = assembleIdentityCoverage({
    rows_total: 10,
    rows_store_resolved: 9,
    rows_store_unresolved: 0,
    rows_store_ambiguous: 1,
    rows_seller_resolved: 10,
    rows_seller_unresolved: 0,
    rows_seller_ambiguous: 0,
    rows_both_resolved: 9,
    store_ambiguous: ['33'],
  });

  assert.equal(result.validation.store_master_key_unique, false);
  assert.equal(result.validation.ok, false);
  assert.deepEqual(result.ambiguous.stores, ['33']);
});
