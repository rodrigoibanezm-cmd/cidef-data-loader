import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCrmLongitudinalFromUniverse, buildCrmLongitudinalQuery, parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';

const base = (extra = {}) => ({ commercial_universe: 'OWN_STORES', metric: 'LEADS_CREATED', grain: 'TOTAL', mode: 'EVENT', date_axis: 'CREATED_AT', date_from: '2026-01-01', date_to: '2026-02-28', time_grain: 'MONTH', ...extra });

test('public longitudinal semantic restrictions remain unchanged', () => {
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), commercial_universe: 'DEALERS' }), /UNSUPPORTED_COMMERCIAL_UNIVERSE/);
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), mode: 'SNAPSHOT' }), /UNSUPPORTED_TEMPORAL_RECONSTRUCTION/);
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), date_axis: 'ASSIGNED_AT' }), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
  assert.throws(() => parseCrmLongitudinalInput({ ...base(), commercial_universe: 'COMPANY', grain: 'SELLER' }), /DOMAIN_MISMATCH/);
});

test('LEADS_ASSIGNED is an EVENT metric on ASSIGNED_AT only', () => {
  const parsed = parseCrmLongitudinalInput(base({ metric: 'LEADS_ASSIGNED', date_axis: 'ASSIGNED_AT' }));
  assert.equal(parsed.metric, 'LEADS_ASSIGNED');
  assert.equal(parsed.mode, 'EVENT');
  assert.equal(parsed.dateAxis, 'ASSIGNED_AT');
  assert.throws(() => parseCrmLongitudinalInput(base({ metric: 'LEADS_ASSIGNED', date_axis: 'CREATED_AT' })), /SEMANTICALLY_IMPOSSIBLE_COMBINATION/);
});

test('LEADS_ASSIGNED counts leads by assigned_date from crm_universe_v01', () => {
  const parsed = parseCrmLongitudinalInput(base({ metric: 'LEADS_ASSIGNED', date_axis: 'ASSIGNED_AT' }));
  const universe = {
    universe: 'crm_universe_v01',
    version: '0.1',
    analytical_events: [
      { assigned_date: '2026-01-10', created_date: '2025-12-30' },
      { assigned_date: '2026-01-25', created_date: '2026-01-25' },
      { assigned_date: '2026-02-03', created_date: '2026-01-31' },
      { assigned_date: null, created_date: '2026-02-05' },
    ],
    coverage: {
      commercial_universe: { company_events: 4, included_events: 4, resolved_other_universe: 0, unresolved: 0, ambiguous: 0, not_applicable: 0 },
      store_identity: { UNRESOLVED: 0, AMBIGUOUS: 0, NOT_APPLICABLE: 0 },
      historical_states: {},
    },
  };
  const result = assembleCrmLongitudinalFromUniverse(parsed, universe);
  assert.deepEqual(result.series.map(({ period, value }) => ({ period, value })), [
    { period: '2026-01', value: 2 },
    { period: '2026-02', value: 1 },
  ]);
  assert.equal(result.metadata.dateAxis, 'ASSIGNED_AT');
  assert.equal(result.metadata.eventDefinitions.leadsAssigned, 'lead counted by assigned_date when metric=LEADS_ASSIGNED and dateAxis=ASSIGNED_AT');
});

test('longitudinal plan points only at crm_universe_v01', () => {
  const parsed = parseCrmLongitudinalInput(base({ metric: 'SOLD', mode: 'COHORT', cohort_axis: 'MANAGED_AT' }));
  assert.deepEqual(buildCrmLongitudinalQuery(parsed), { universe: 'crm_universe_v01', version: '0.1', commercial_universe: 'OWN_STORES', eligibility_date_axis: 'MANAGED_AT' });
});
