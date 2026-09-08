import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assembleCrmContextFromUniverse,
  parseCrmContextInput,
} from '../lib/crm-context/buildCrmContext.js';
import {
  listCustomGptActions,
  listDomainCapabilities,
  resolveDomainCapability,
} from '../lib/custom-gpt-router.js';
import crmHandler from '../api/custom-gpt/crm.js';

function event(extra = {}) {
  return {
    lead_id: '1',
    created_date: '2026-08-01',
    assigned_date: '2026-08-02',
    managed_date: '2026-08-03',
    managed_raw: '03-08-2026',
    vendido_raw: 'No',
    sold_norm: 'NO',
    estado_raw: 'En gestión',
    status_norm: 'EN GESTION',
    interest_level: 'Alto',
    interest_level_norm: 'ALTO',
    origin_raw: 'Web',
    origin_norm: 'WEB',
    suborigin_raw: 'Cotizador',
    suborigin_norm: 'COTIZADOR',
    product_interest_raw: 'Foton G7',
    product_interest_norm: 'FOTON G7',
    product_identity_status: 'RESOLVED',
    brand_match_count: 1,
    brand: 'FOTON',
    store_resolution_status: 'RESOLVED',
    sucursal_id: 7,
    sucursal_nombre: 'BELLAVISTA',
    seller_resolution_status: 'RESOLVED',
    persona_id: 100,
    ...extra,
  };
}

function crmUniverse(commercialUniverse = 'OWN_STORES') {
  return {
    universe: 'crm_universe_v01',
    version: '0.1',
    commercial_universe: commercialUniverse,
    period: { last_observed_date: null },
    analytical_events: [
      event(),
      event({
        lead_id: '2', created_date: '2026-08-05', assigned_date: '2026-08-06', managed_date: null,
        managed_raw: '', vendido_raw: 'Sí', sold_norm: 'SI', estado_raw: 'Cerrado', status_norm: 'CERRADO',
        interest_level: null, interest_level_norm: null, origin_raw: 'Web', origin_norm: 'WEB',
        suborigin_raw: null, suborigin_norm: null, product_interest_raw: 'Dongfeng Mage',
        product_interest_norm: 'DONGFENG MAGE', brand: 'DONGFENG', sucursal_id: 8, sucursal_nombre: 'MEGACENTER',
      }),
      event({
        lead_id: '3', created_date: '2026-08-10', assigned_date: '2026-08-11', managed_date: null,
        managed_raw: 'fecha inválida', vendido_raw: null, sold_norm: null, estado_raw: null, status_norm: null,
        origin_raw: 'Piso', origin_norm: 'PISO', product_interest_raw: null, product_interest_norm: null,
        product_identity_status: 'NOT_APPLICABLE', brand_match_count: 0, brand: null,
        seller_resolution_status: 'UNRESOLVED', persona_id: null,
      }),
      event({ lead_id: '4', created_date: '2026-07-15', assigned_date: '2026-07-16' }),
      event({ lead_id: '5', created_date: '2026-08-20', assigned_date: null }),
    ],
    coverage: {
      historical_states: { historical_extra_versions: 2 },
    },
    warnings: ['UPSTREAM_CRM_WARNING'],
  };
}

const assignedInput = {
  commercial_universe: 'OWN_STORES',
  date_from: '2026-08-01',
  date_to: '2026-08-31',
  date_axis: 'ASSIGNED_AT',
};

test('ASSIGNED_AT + OWN_STORES builds the stable descriptive context', () => {
  const parsed = parseCrmContextInput(assignedInput);
  const result = assembleCrmContextFromUniverse(parsed, crmUniverse());
  assert.deepEqual(Object.keys(result), ['scope', 'context_population', 'headline', 'demand_mix', 'commercial_state', 'network', 'quality', 'metadata']);
  assert.equal(result.context_population.count, 3);
  assert.equal(result.context_population.selection_date_axis, 'ASSIGNED_AT');
  assert.equal(result.headline.leads_assigned.count, 3);
  assert.equal(result.headline.managed.numerator, 1);
  assert.equal(result.headline.unmanaged.numerator, 2);
  assert.equal(result.headline.management_coverage.denominator, 3);
  assert.equal(result.metadata.state_semantics, 'CURRENT_STATE');
});

test('CREATED_AT + OWN_STORES exposes demand generation and suppresses current commercial metrics', () => {
  const parsed = parseCrmContextInput({ ...assignedInput, date_axis: 'CREATED_AT' });
  const result = assembleCrmContextFromUniverse(parsed, crmUniverse());
  assert.equal(result.context_population.count, 4);
  assert.equal(result.headline.leads_created.count, 4);
  assert.deepEqual(result.headline.managed, { available: false, reason: 'NOT_APPLICABLE_FOR_CREATED_AT_CONTEXT' });
  assert.deepEqual(result.commercial_state, { available: false, reason: 'NOT_APPLICABLE_FOR_CREATED_AT_CONTEXT' });
  assert.equal('leads_assigned' in result.headline, false);
});

test('COMPANY is explicit and its network block is not applicable', () => {
  const parsed = parseCrmContextInput({ ...assignedInput, commercial_universe: 'COMPANY' });
  const result = assembleCrmContextFromUniverse(parsed, crmUniverse('COMPANY'));
  assert.equal(result.scope.commercial_universe, 'COMPANY');
  assert.deepEqual(result.network, { available: false, reason: 'NETWORK_NOT_APPLICABLE_FOR_COMPANY_CONTEXT' });
});

test('empty periods are valid non-evaluable contexts', () => {
  const parsed = parseCrmContextInput({ ...assignedInput, date_from: '2025-01-01', date_to: '2025-01-31' });
  const result = assembleCrmContextFromUniverse(parsed, crmUniverse());
  assert.equal(result.context_population.count, 0);
  assert.equal(result.metadata.context_evaluable, false);
  assert.equal(result.metadata.context_evaluability_reason, 'NO_ANALYTICAL_EVENTS');
});

test('unsupported universe, axis and filters fail closed', () => {
  assert.throws(() => parseCrmContextInput({ ...assignedInput, commercial_universe: 'DEALERS' }), (error) => error.code === 'UNSUPPORTED_COMMERCIAL_UNIVERSE');
  assert.throws(() => parseCrmContextInput({ ...assignedInput, date_axis: 'MANAGED_AT' }), (error) => error.code === 'INVALID_DATE_AXIS');
  assert.throws(() => parseCrmContextInput({ ...assignedInput, filters: { seller: 'Ana' } }), (error) => error.code === 'UNSUPPORTED_FILTER');
  assert.throws(() => parseCrmContextInput({ ...assignedInput, date_from: '2026-09-01' }), (error) => error.code === 'INVALID_PERIOD');
});

test('supported filters are applied with AND across dimensions and OR within one dimension', () => {
  const parsed = parseCrmContextInput({ ...assignedInput, filters: { brand: ['Foton', 'Dongfeng'], origin: 'Web', store: 'Megacenter' } });
  const result = assembleCrmContextFromUniverse(parsed, crmUniverse());
  assert.equal(result.context_population.count, 1);
  assert.equal(result.headline.sold.count, 1);
  assert.deepEqual(result.scope.filters, { brand: ['FOTON', 'DONGFENG'], origin: ['WEB'], store: ['MEGACENTER'] });
});

test('ratios expose certified denominators and unknown outcomes', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  assert.deepEqual(result.headline.conversion_rate, { numerator: 1, denominator: 2, unknown_count: 1, value: 0.5 });
  assert.deepEqual(result.headline.management_coverage, { numerator: 1, denominator: 3, unknown_count: 0, value: 1 / 3 });
});

test('demand mix and OWN_STORES network reconcile explicitly', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  const origin = result.demand_mix.origin;
  assert.equal(origin.resolved_population + origin.unresolved_population, origin.denominator);
  assert.equal(origin.items.reduce((sum, item) => sum + item.count, 0), origin.resolved_population);
  assert.equal(result.network.stores.reduce((sum, store) => sum + store.leads, 0), result.network.resolved_population);
  assert.equal(result.network.resolved_population, result.context_population.count);
});

test('upstream warnings, coverage and versioned-history semantics are preserved', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  assert.ok(result.quality.warnings.includes('UPSTREAM_CRM_WARNING'));
  assert.ok(result.quality.warnings.includes('CRM_VERSIONED_HISTORY_AVAILABLE_CURRENT_CONTRACT_USES_CURRENT_STATE'));
  assert.equal(result.metadata.historical_state_available, true);
  assert.deepEqual(result.quality.source_universe_coverage, crmUniverse().coverage);
  for (const key of ['commercial_scope_coverage', 'date_axis_coverage', 'store_identity_coverage', 'seller_identity_coverage', 'brand_identity_coverage', 'product_identity_coverage']) {
    assert.equal(result.quality[key].available, true, key);
    assert.ok(Object.hasOwn(result.quality[key], 'resolved_ratio'), key);
  }
});

test('dimensions absent from the prepared universe remain structurally unavailable', () => {
  const universe = {
    universe: 'crm_universe_v01',
    version: '0.1',
    commercial_universe: 'OWN_STORES',
    analytical_events: [{ lead_id: '1', assigned_date: '2026-08-02', managed_date: null }],
    coverage: {},
    warnings: [],
  };
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), universe);
  assert.deepEqual(result.demand_mix.brand, {
    available: false,
    reason: 'DIMENSION_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE',
    resolved_population: 0,
    unresolved_population: 0,
    denominator: 0,
    items: [],
  });
  assert.equal(result.quality.brand_identity_coverage.available, false);
  assert.equal(result.commercial_state.status_distribution.available, false);
  assert.equal(result.headline.sold.available, false);
  assert.equal(result.network.available, false);
});

test('crm_context_v01 has no direct forbidden runtime dependency', () => {
  const builder = readFileSync(new URL('../lib/crm-context/buildCrmContext.js', import.meta.url), 'utf8');
  const motor = readFileSync(new URL('../lib/motors/crm-context-v01.js', import.meta.url), 'utf8');
  const source = `${builder}\n${motor}`;
  assert.match(source, /buildCrmUniverse/);
  assert.doesNotMatch(source, /crm-longitudinal-context|longitudinal\/crm|customGptDb|CRM_Cidef_raw|_master\b/i);
  assert.doesNotMatch(source, /\b(SELECT|FROM|JOIN)\b/);
});

test('router and CRM endpoint expose CONTEXT without opening a new domain', () => {
  assert.ok(listCustomGptActions().includes('crm_context_v01'));
  assert.ok(listDomainCapabilities('CRM').includes('CONTEXT'));
  assert.deepEqual(resolveDomainCapability('CRM', 'CONTEXT'), { domain: 'CRM', capability: 'CONTEXT', action: 'crm_context_v01' });
  assert.equal(typeof crmHandler, 'function');
});
