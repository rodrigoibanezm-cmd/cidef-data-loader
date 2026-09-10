import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assembleCrmContextFromUniverse,
  buildCrmContext,
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
    store_raw: 'Bellavista',
    store_resolution_status: 'RESOLVED',
    sucursal_id: 7,
    sucursal_nombre: 'BELLAVISTA',
    seller_raw: 'Ana Uno',
    seller_resolution_status: 'RESOLVED',
    persona_id: 100,
    persona_nombre: 'ANA UNO',
    eligible_vendedor_cidef: true,
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
        product_interest_norm: 'DONGFENG MAGE', brand: 'DONGFENG', store_raw: 'Megacenter',
        sucursal_id: 8, sucursal_nombre: 'MEGACENTER', seller_raw: 'Beto Dos', persona_id: 200, persona_nombre: 'BETO DOS',
      }),
      event({
        lead_id: '3', created_date: '2026-08-10', assigned_date: '2026-08-11', managed_date: null,
        managed_raw: 'fecha inválida', vendido_raw: null, sold_norm: null, estado_raw: null, status_norm: null,
        origin_raw: 'Piso', origin_norm: 'PISO', product_interest_raw: null, product_interest_norm: null,
        product_identity_status: 'NOT_APPLICABLE', brand_match_count: 0, brand: null,
        seller_raw: 'Sin Match', seller_resolution_status: 'UNRESOLVED', persona_id: null, persona_nombre: null,
      }),
      event({ lead_id: '4', created_date: '2026-07-15', assigned_date: '2026-07-16' }),
      event({ lead_id: '5', created_date: '2026-08-20', assigned_date: null }),
    ],
    coverage: { historical_states: { historical_extra_versions: 2 } },
    warnings: ['UPSTREAM_CRM_WARNING'],
  };
}

const assignedInput = {
  commercial_universe: 'OWN_STORES',
  date_from: '2026-08-01',
  date_to: '2026-08-31',
  date_axis: 'ASSIGNED_AT',
};

test('ASSIGNED_AT + OWN_STORES builds the stable descriptive context additively', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  assert.deepEqual(Object.keys(result), ['scope', 'context_population', 'headline', 'demand_mix', 'commercial_state', 'network', 'quality', 'operational', 'validation', 'metadata']);
  assert.equal(result.context_population.count, 3);
  assert.equal(result.context_population.selection_date_axis, 'ASSIGNED_AT');
  assert.equal(result.headline.leads_assigned.count, 3);
  assert.equal(result.headline.managed.numerator, 1);
  assert.equal(result.headline.unmanaged.numerator, 2);
  assert.equal(result.headline.management_coverage.denominator, 3);
  assert.equal(result.metadata.state_semantics, 'CURRENT_STATE');
});

test('operational block reconciles parallel MANAGEMENT and RESULT partitions including SOLD without MANAGED', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  const op = result.operational;
  assert.equal(op.assigned.count, 3);
  assert.equal(op.management.managed.count, 1);
  assert.equal(op.management.unmanaged.count, 2);
  assert.equal(op.result.sold.count, 1);
  assert.equal(op.result.not_sold.count, 1);
  assert.equal(op.result.unknown.count, 1);
  assert.deepEqual(op.management.management_coverage, { numerator: 1, denominator: 3, unknown_count: 0, value: 1 / 3 });
  assert.deepEqual(op.result.conversion_rate, { numerator: 1, denominator: 2, unknown_count: 1, value: 0.5 });
  assert.deepEqual(op.result.conversion_on_managed, { numerator: 0, denominator: 1, unknown_count: 0, value: 0 });
  assert.equal(result.validation.operational.management_partition.valid, true);
  assert.equal(result.validation.operational.result_partition.valid, true);
  assert.equal(result.validation.operational.management_partition.assigned, 3);
  assert.equal(result.validation.operational.result_partition.assigned, 3);
});

test('conversion_on_managed counts only SOLD && MANAGED over MANAGED', () => {
  const universe = crmUniverse();
  universe.analytical_events[0] = event({ sold_norm: 'SI', vendido_raw: 'Sí' });
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), universe);
  assert.deepEqual(result.operational.result.conversion_on_managed, { numerator: 1, denominator: 1, unknown_count: 0, value: 1 });
  assert.equal(result.operational.result.sold.count, 2);
});

test('STORE operational breakdown uses canonical store identity and same operational contract', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  assert.equal(result.operational.by_store.available, true);
  assert.equal(result.operational.by_store.denominator, 3);
  const bellavista = result.operational.by_store.items.find((item) => item.store_id === '7');
  const megacenter = result.operational.by_store.items.find((item) => item.store_id === '8');
  assert.equal(bellavista.identity_status, 'RESOLVED');
  assert.equal(bellavista.operational.assigned.count, 2);
  assert.equal(bellavista.operational.management.managed.count, 1);
  assert.equal(megacenter.operational.assigned.count, 1);
  assert.equal(megacenter.operational.result.sold.count, 1);
});

test('SELLER operational breakdown preserves RESOLVED, UNRESOLVED, NOT_APPLICABLE and AMBIGUOUS identity states', () => {
  const universe = crmUniverse();
  universe.analytical_events.push(
    event({ lead_id: '6', assigned_date: '2026-08-12', seller_raw: '', seller_resolution_status: 'NOT_APPLICABLE', persona_id: null, persona_nombre: null, eligible_vendedor_cidef: false }),
    event({ lead_id: '7', assigned_date: '2026-08-13', seller_raw: 'Duplicado', seller_resolution_status: 'AMBIGUOUS', seller_match_count: 2, persona_id: null, persona_nombre: null }),
  );
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), universe);
  const sellers = result.operational.by_seller.items;
  assert.ok(sellers.some((item) => item.seller_id === '100' && item.identity_status === 'RESOLVED'));
  assert.ok(sellers.some((item) => item.seller_id === '200' && item.identity_status === 'RESOLVED'));
  assert.ok(sellers.some((item) => item.identity_status === 'UNRESOLVED'));
  assert.ok(sellers.some((item) => item.identity_status === 'NOT_APPLICABLE'));
  assert.ok(sellers.some((item) => item.identity_status === 'AMBIGUOUS'));
  assert.equal(result.operational.by_seller.denominator, 5);
});

test('seller filtering uses canonical seller_id only and keeps free-name seller unsupported', () => {
  const parsed = parseCrmContextInput({ ...assignedInput, filters: { seller_id: 200 } });
  const result = assembleCrmContextFromUniverse(parsed, crmUniverse());
  assert.equal(result.context_population.count, 1);
  assert.equal(result.operational.assigned.count, 1);
  assert.equal(result.operational.result.sold.count, 1);
  assert.deepEqual(result.scope.filters, { seller_id: ['200'] });
  assert.throws(() => parseCrmContextInput({ ...assignedInput, filters: { seller: 'Beto Dos' } }), (error) => error.code === 'UNSUPPORTED_FILTER');
});

test('CREATED_AT + OWN_STORES preserves demand generation semantics and suppresses operational current-state metrics', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput({ ...assignedInput, date_axis: 'CREATED_AT' }), crmUniverse());
  assert.equal(result.context_population.count, 4);
  assert.equal(result.headline.leads_created.count, 4);
  assert.deepEqual(result.headline.managed, { available: false, reason: 'NOT_APPLICABLE_FOR_CREATED_AT_CONTEXT' });
  assert.deepEqual(result.commercial_state, { available: false, reason: 'NOT_APPLICABLE_FOR_CREATED_AT_CONTEXT' });
  assert.deepEqual(result.operational, { available: false, reason: 'NOT_APPLICABLE_FOR_CREATED_AT_CONTEXT' });
  assert.equal('leads_assigned' in result.headline, false);
});

test('COMPANY is explicit and its legacy network block remains not applicable', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput({ ...assignedInput, commercial_universe: 'COMPANY' }), crmUniverse('COMPANY'));
  assert.equal(result.scope.commercial_universe, 'COMPANY');
  assert.deepEqual(result.network, { available: false, reason: 'NETWORK_NOT_APPLICABLE_FOR_COMPANY_CONTEXT' });
});

test('empty periods are valid non-evaluable contexts', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput({ ...assignedInput, date_from: '2025-01-01', date_to: '2025-01-31' }), crmUniverse());
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

test('supported legacy filters remain AND across dimensions and OR within one dimension', () => {
  const parsed = parseCrmContextInput({ ...assignedInput, filters: { brand: ['Foton', 'Dongfeng'], origin: 'Web', store: 'Megacenter' } });
  const result = assembleCrmContextFromUniverse(parsed, crmUniverse());
  assert.equal(result.context_population.count, 1);
  assert.equal(result.headline.sold.count, 1);
  assert.deepEqual(result.scope.filters, { brand: ['FOTON', 'DONGFENG'], origin: ['WEB'], store: ['MEGACENTER'] });
});

test('legacy ratios expose the same certified denominators and unknown outcomes', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  assert.deepEqual(result.headline.conversion_rate, { numerator: 1, denominator: 2, unknown_count: 1, value: 0.5 });
  assert.deepEqual(result.headline.management_coverage, { numerator: 1, denominator: 3, unknown_count: 0, value: 1 / 3 });
  assert.deepEqual(result.headline.managed, { numerator: 1, denominator: 3, unknown_count: 0, value: 1 / 3 });
  assert.deepEqual(result.headline.unmanaged, { numerator: 2, denominator: 3, unknown_count: 0, value: 2 / 3 });
});

test('demand mix and legacy OWN_STORES network reconcile explicitly', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  const origin = result.demand_mix.origin;
  assert.equal(origin.resolved_population + origin.unresolved_population, origin.denominator);
  assert.equal(origin.items.reduce((sum, item) => sum + item.count, 0), origin.resolved_population);
  assert.equal(result.network.stores.reduce((sum, store) => sum + store.leads, 0), result.network.resolved_population);
  assert.equal(result.network.resolved_population, result.context_population.count);
});

test('coverage includes metric availability while preserving upstream and identity coverage', () => {
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), crmUniverse());
  assert.ok(result.quality.warnings.includes('UPSTREAM_CRM_WARNING'));
  assert.ok(result.quality.warnings.includes('CRM_VERSIONED_HISTORY_AVAILABLE_CURRENT_CONTRACT_USES_CURRENT_STATE'));
  assert.equal(result.metadata.historical_state_available, true);
  assert.deepEqual(result.quality.source_universe_coverage, crmUniverse().coverage);
  for (const key of ['commercial_scope_coverage', 'date_axis_coverage', 'store_identity_coverage', 'seller_identity_coverage', 'brand_identity_coverage', 'product_identity_coverage', 'management_metric_coverage', 'result_metric_coverage']) {
    assert.equal(result.quality[key].available, true, key);
    assert.ok(Object.hasOwn(result.quality[key], 'resolved_ratio'), key);
  }
  assert.equal(result.quality.result_metric_coverage.resolved, 2);
  assert.equal(result.quality.result_metric_coverage.unresolved, 1);
});

test('dimensions absent from prepared universe remain structurally unavailable', () => {
  const universe = {
    universe: 'crm_universe_v01', version: '0.1', commercial_universe: 'OWN_STORES',
    analytical_events: [{ lead_id: '1', assigned_date: '2026-08-02', managed_date: null }], coverage: {}, warnings: [],
  };
  const result = assembleCrmContextFromUniverse(parseCrmContextInput(assignedInput), universe);
  assert.deepEqual(result.demand_mix.brand, {
    available: false, reason: 'DIMENSION_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE', resolved_population: 0, unresolved_population: 0, denominator: 0, items: [],
  });
  assert.equal(result.quality.brand_identity_coverage.available, false);
  assert.equal(result.commercial_state.status_distribution.available, false);
  assert.equal(result.headline.sold.available, false);
  assert.equal(result.network.available, false);
  assert.equal(result.operational.result.available, false);
  assert.equal(result.operational.by_store.available, false);
  assert.equal(result.operational.by_seller.available, false);
});

test('buildCrmContext uses an injected universe without requiring RAW or MASTER access', async () => {
  const universe = crmUniverse();
  const result = await buildCrmContext(assignedInput, { universe });
  assert.equal(result.context_population.count, 3);
  assert.equal(result.metadata.source_universe, 'crm_universe_v01');
  assert.equal(result.operational.assigned.count, 3);
});

test('crm_context_v01 has no direct forbidden runtime dependency or snapshot/as-of semantics', () => {
  const builder = readFileSync(new URL('../lib/crm-context/buildCrmContext.js', import.meta.url), 'utf8');
  const motor = readFileSync(new URL('../lib/motors/crm-context-v01.js', import.meta.url), 'utf8');
  const source = `${builder}\n${motor}`;
  assert.match(source, /buildCrmUniverse/);
  assert.doesNotMatch(source, /crm-longitudinal-context|longitudinal\/crm|customGptDb|CRM_Cidef_raw|_master\b/i);
  assert.doesNotMatch(source, /\b(SELECT|FROM|JOIN)\b/);
  assert.doesNotMatch(source, /\bas_of\b|SNAPSHOT/i);
});

test('router and CRM endpoint expose CONTEXT without opening a new domain', () => {
  assert.ok(listCustomGptActions().includes('crm_context_v01'));
  assert.ok(listDomainCapabilities('CRM').includes('CONTEXT'));
  assert.deepEqual(resolveDomainCapability('CRM', 'CONTEXT'), { domain: 'CRM', capability: 'CONTEXT', action: 'crm_context_v01' });
  assert.equal(typeof crmHandler, 'function');
});
