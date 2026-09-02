import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyObservationState } from '../lib/observation-semantics/observationState.js';
import { nvIdentityStatus } from '../lib/observation-semantics/resolveNvIdentity.js';
import { parseFechaFactura } from '../lib/motors/ventas-monthly-dedup-sensitivity-v01.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('observation state preserves positive, active zero and unknown', () => {
  assert.deepEqual(classifyObservationState(3, 2), { state: 'OBSERVED_POSITIVE', sales: 3 });
  assert.deepEqual(classifyObservationState(3, 0), { state: 'OBSERVED_POSITIVE', sales: 3 });
  assert.deepEqual(classifyObservationState(0, 2), { state: 'ACTIVE_ZERO', sales: 0 });
  assert.deepEqual(classifyObservationState(0, 0), { state: 'UNKNOWN', sales: null });
});

test('existing deterministic date parser accepts observed NV formats', () => {
  assert.equal(parseFechaFactura('7/30/26 0:00').month, '2026-07');
  assert.equal(parseFechaFactura('12/23/25 0:00').month, '2025-12');
  assert.equal(parseFechaFactura('1/10/21 0:00').month, '2021-01');
  assert.equal(parseFechaFactura('invalid').error, 'unsupported_format');
});

test('NV identity classification is exact and conservative', () => {
  assert.equal(nvIdentityStatus({ match_count: 1, sucursal_id: 7 }), 'RESOLVED');
  assert.equal(nvIdentityStatus({ match_count: 0, sucursal_id: null }), 'UNRESOLVED');
  assert.equal(nvIdentityStatus({ match_count: 2, sucursal_id: 7 }), 'AMBIGUOUS');
});

test('audit action is registered in router, schema and motors registry', async () => {
  const [router, schema, motors] = await Promise.all([
    read('lib/custom-gpt-router.js'), read('rom/schema.json'), read('rom/motors.md'),
  ]);
  for (const text of [router, schema, motors]) assert.match(text, /org_sales_observation_semantics_audit_v01/);
});
