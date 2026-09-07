import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrmLongitudinalQuery, parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

const base = (extra = {}) => ({ commercial_universe: 'OWN_STORES', metric: 'LEADS_CREATED', grain: 'TOTAL', mode: 'EVENT', date_axis: 'CREATED_AT', date_from: '2026-01-01', date_to: '2026-02-28', time_grain: 'MONTH', ...extra });

test('public longitudinal semantic restrictions remain unchanged', () => {
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), commercial_universe: 'DEALERS' }), /UNSUPPORTED_COMMERCIAL_UNIVERSE/);
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), mode: 'SNAPSHOT' }), /UNSUPPORTED_TEMPORAL_RECONSTRUCTION/);
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), date_axis: 'ASSIGNED_AT' }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), commercial_universe: 'COMPANY', grain: 'SELLER' }), /DOMAIN_MISMATCH/);
});

test('longitudinal plan points only at crm_universe_v01', () => {
  const parsed = parseCrmLongitudinalInput(base({ metric: 'SOLD', mode: 'COHORT', cohort_axis: 'MANAGED_AT' }));
  assert.deepEqual(buildCrmLongitudinalQuery(parsed), { universe: 'crm_universe_v01', version: '0.1', commercial_universe: 'OWN_STORES', eligibility_date_axis: 'MANAGED_AT' });
});
