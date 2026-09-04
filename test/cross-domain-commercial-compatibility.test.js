import test from 'node:test';
import assert from 'node:assert/strict';
import { assertVentasCrmCommercialDomainCompatibility } from '../lib/longitudinal/commercial-domain-compatibility.js';
import { parseCrmLongitudinalInput } from '../lib/longitudinal/crm.js';
import { runCustomGptActionWithContext } from '../lib/custom-gpt-router.js';

for (const universe of ['COMPANY', 'OWN_STORES']) {
  test(`VENTAS ${universe} ↔ CRM ${universe} is compatible`, () => {
    assert.equal(assertVentasCrmCommercialDomainCompatibility(universe, universe), true);
  });
}

for (const [ventas, crm] of [
  ['COMPANY', 'OWN_STORES'],
  ['OWN_STORES', 'COMPANY'],
  ['DEALERS', 'OWN_STORES'],
  ['OWN_STORES', 'DEALERS'],
  ['DEALERS', 'COMPANY'],
  ['COMPANY', 'DEALERS'],
  ['DEALERS', 'DEALERS'],
]) {
  test(`VENTAS ${ventas} ↔ CRM ${crm} fails with DOMAIN_MISMATCH`, () => {
    assert.throws(
      () => assertVentasCrmCommercialDomainCompatibility(ventas, crm),
      (error) => error.code === 'DOMAIN_MISMATCH',
    );
  });
}

const crmBase = {
  metric: 'LEADS_CREATED', grain: 'TOTAL', mode: 'EVENT', date_axis: 'CREATED_AT',
  date_from: '2026-01-01', date_to: '2026-01-31', time_grain: 'MONTH', filters: {},
};

test('CRM DEALERS remains UNSUPPORTED_COMMERCIAL_UNIVERSE before cross-domain compatibility', () => {
  assert.throws(
    () => parseCrmLongitudinalInput({ ...crmBase, commercial_universe: 'DEALERS' }),
    (error) => error.code === 'UNSUPPORTED_COMMERCIAL_UNIVERSE',
  );
});

function crmContext(commercialUniverse) {
  return { domain: 'CRM', commercial_universe: commercialUniverse, ...crmBase };
}

function executorFor(ventasUniverse, crmUniverse) {
  return async (action) => action === 'crm_longitudinal_context_v01'
    ? { domain: 'CRM', commercial_scope: { universe: crmUniverse } }
    : { domain: 'VENTAS', commercial_scope: { universe: ventasUniverse } };
}

function executorWithMissingScope(missingDomain) {
  return async (action) => {
    if (action === 'crm_longitudinal_context_v01') {
      return missingDomain === 'CRM'
        ? { domain: 'CRM' }
        : { domain: 'CRM', commercial_scope: { universe: 'OWN_STORES' } };
    }
    return missingDomain === 'VENTAS'
      ? { domain: 'VENTAS' }
      : { domain: 'VENTAS', commercial_scope: { universe: 'OWN_STORES' } };
  };
}

test('multi-domain flow composes matching certified scopes', async () => {
  await assert.doesNotReject(() => runCustomGptActionWithContext({
    action: 'ventas_longitudinal_context_v01',
    input: {},
    requires_longitudinal_context: true,
    longitudinal_context: crmContext('OWN_STORES'),
  }, executorFor('OWN_STORES', 'OWN_STORES')));
});

test('multi-domain flow rejects mismatched certified scopes before composition', async () => {
  await assert.rejects(() => runCustomGptActionWithContext({
    action: 'ventas_longitudinal_context_v01',
    input: {},
    requires_longitudinal_context: true,
    longitudinal_context: crmContext('OWN_STORES'),
  }, executorFor('COMPANY', 'OWN_STORES')), (error) => error.code === 'DOMAIN_MISMATCH');
});

for (const missingDomain of ['VENTAS', 'CRM']) {
  test(`multi-domain flow rejects missing ${missingDomain} commercial scope before composition`, async () => {
    await assert.rejects(() => runCustomGptActionWithContext({
      action: 'ventas_longitudinal_context_v01',
      input: {},
      requires_longitudinal_context: true,
      longitudinal_context: crmContext('OWN_STORES'),
    }, executorWithMissingScope(missingDomain)),
    (error) => error.code === 'MISSING_COMMERCIAL_SCOPE');
  });
}
