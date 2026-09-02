import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyObservationState } from '../lib/observation-semantics/observationState.js';
import { nvIdentityStatus } from '../lib/observation-semantics/resolveNvIdentity.js';
import { parseFechaFactura } from '../lib/motors/ventas-monthly-dedup-sensitivity-v01.js';
import { buildActiveZeroDetail } from '../lib/observation-semantics/buildActiveZeroDetail.js';
import { buildUnitUniverseAudit } from '../lib/observation-semantics/buildUnitUniverseAudit.js';
import {
  validateActiveZeroInvariant,
  validateUnknownBreaksContinuity,
  validateNoFutureSignalLeakage,
} from '../lib/observation-semantics/auditObservationInvariants.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');
const unit = (id, months = new Map()) => ({ unit_id: id, unit_label: `U${id}`, months });

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

test('ACTIVE_ZERO detail exposes the invariant evidence', () => {
  const snapshots = new Map([
    ['2024-01', { units: new Map([['1', unit(1)]]) }],
  ]);
  const rows = buildActiveZeroDetail(
    { snapshots },
    new Map([['1', new Map([['2024-01', 2]])]]),
    { startMonth: '2024-01', endMonth: '2024-01' },
  );
  assert.deepEqual(rows[0], {
    unit_id: 1, unit_label: 'U1', month: '2024-01',
    recognized_sales: 0, nv_count: 2, state: 'ACTIVE_ZERO', sales: 0,
  });
  assert.equal(validateActiveZeroInvariant(rows), true);
});

test('UNKNOWN gaps cannot be crossed by confirmed persistence', () => {
  const rows = [
    { unit_id: 1, month: '2024-01' },
    { unit_id: 1, month: '2024-03' },
  ];
  const episodes = [{ unit_id: 1, onset_month: '2024-01', confirmation_month: '2024-03' }];
  assert.equal(validateUnknownBreaksContinuity(rows, episodes), false);
  rows.push({ unit_id: 1, month: '2024-02' });
  assert.equal(validateUnknownBreaksContinuity(rows, episodes), true);
});

test('signal leakage validation requires prior history and current actual cutoff', () => {
  const valid = [{
    month: '2024-02', history_cutoff_month: '2024-01', actual_cutoff_month: '2024-02',
    baseline_history_required: ['2023-02'],
  }];
  assert.equal(validateNoFutureSignalLeakage(valid), true);
  assert.equal(validateNoFutureSignalLeakage([
    { ...valid[0], baseline_history_required: ['2024-03'] },
  ]), false);
});

test('unit universe reconciles observed units versus candidate-evaluable units', () => {
  const snapshots = new Map([[
    '2024-01',
    { units: new Map([['1', unit(1)], ['2', unit(2)]]) },
  ]]);
  const audit = buildUnitUniverseAudit({ snapshots }, { rows: [{ unit_id: 1 }] });
  assert.equal(audit.observed_units_total, 2);
  assert.equal(audit.candidate_evaluable_units, 1);
  assert.equal(audit.units_without_candidate_rows, 1);
  assert.equal(audit.units_without_candidate_rows_detail[0].unit_id, 2);
});

test('audit action is registered in router, schema and motors registry', async () => {
  const [router, schema, motors] = await Promise.all([
    read('lib/custom-gpt-router.js'), read('rom/schema.json'), read('rom/motors.md'),
  ]);
  for (const text of [router, schema, motors]) assert.match(text, /org_sales_observation_semantics_audit_v01/);
});
