import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDomainCapabilityRequest } from '../lib/custom-gpt/domainEndpoint.js';
import { runCustomGptCapability } from '../lib/custom-gpt-router.js';
import salesHandler from '../api/custom-gpt/sales.js';
import marketHandler from '../api/custom-gpt/market.js';
import discoveryHandler from '../api/custom-gpt/discovery.js';
import longitudinalHandler from '../api/custom-gpt/longitudinal.js';
import crmHandler from '../api/custom-gpt/crm.js';
import pricingHandler from '../api/custom-gpt/pricing.js';

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
  };
}
function request(method = 'POST', body = {}) { return { method, body }; }

const endpointBindings = [
  ['SALES', salesHandler, 'MONTHLY_ACTUAL'],
  ['MARKET', marketHandler, 'MARKET_HISTORY'],
  ['CRM', crmHandler, 'CONTEXT'],
  ['PRICING', pricingHandler, 'HISTORY'],
  ['DISCOVERY', discoveryHandler, 'LIST_TABLES'],
  ['LONGITUDINAL', longitudinalHandler, 'VENTAS'],
];

for (const [domain, handler, capability] of endpointBindings) {
  test(`${domain} endpoint binds its domain and executes only capability contract`, async () => {
    const res = responseRecorder(); let captured = null;
    const executor = async (payload) => { captured = payload; return { routed: true }; };
    await handleDomainCapabilityRequest(domain, request('POST', { capability, input: { marker: domain } }), res, executor);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.domain, domain);
    assert.equal(res.payload.capability, capability);
    assert.deepEqual(captured, { domain, capability, input: { marker: domain } });
    assert.equal(typeof handler, 'function');
  });
}

test('PRICING HISTORY endpoint and router preserve current public input', async () => {
  const input = { version_id: 9906, date_from: '2026-03-01', date_to: '2026-09-10', include_conflicts: true };
  const res = responseRecorder(); let dispatched = null;
  await handleDomainCapabilityRequest('PRICING', request('POST', { capability: 'HISTORY', input }), res,
    (payload) => runCustomGptCapability(payload, async (action, motorInput) => { dispatched = { action, input: motorInput }; return { routed: true }; }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(dispatched, { action: 'pricing_history_v01', input });
  assert.deepEqual(res.payload.result, { routed: true });
});

test('CRM CONTEXT endpoint and router preserve its complete public input', async () => {
  const input = { commercial_universe: 'OWN_STORES', date_from: '2026-08-01', date_to: '2026-08-31', date_axis: 'ASSIGNED_AT', filters: {} };
  const res = responseRecorder(); let dispatched = null;
  await handleDomainCapabilityRequest('CRM', request('POST', { capability: 'CONTEXT', input }), res,
    (payload) => runCustomGptCapability(payload, async (action, motorInput) => { dispatched = { action, input: motorInput }; return { routed: true }; }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(dispatched, { action: 'crm_context_v01', input });
  assert.deepEqual(res.payload.result, { routed: true });
});

test('domain endpoint rejects non-POST methods', async () => {
  const res = responseRecorder(); await handleDomainCapabilityRequest('SALES', request('GET'), res, async () => ({}));
  assert.equal(res.statusCode, 405); assert.equal(res.payload.ok, false); assert.deepEqual(res.payload.allowedCapabilities.includes('MONTHLY_ACTUAL'), true);
});
test('domain endpoint requires capability', async () => {
  const res = responseRecorder(); await handleDomainCapabilityRequest('MARKET', request('POST', { input: {} }), res, async () => ({}));
  assert.equal(res.statusCode, 400); assert.equal(res.payload.error_code, 'MISSING_CAPABILITY');
});
test('domain endpoint rejects physical action field instead of ignoring it', async () => {
  const res = responseRecorder();
  await handleDomainCapabilityRequest('SALES', request('POST', { capability: 'MONTHLY_ACTUAL', action: 'dealer_inventory_aging_v01', input: {} }), res, async () => ({}));
  assert.equal(res.statusCode, 400); assert.equal(res.payload.error_code, 'UNSUPPORTED_DOMAIN_REQUEST_FIELD'); assert.match(res.payload.error, /action/);
});
test('domain endpoint rejects capability from another domain', async () => {
  const res = responseRecorder(); await handleDomainCapabilityRequest('SALES', request('POST', { capability: 'SHARE_TRAJECTORY', input: {} }), res);
  assert.equal(res.statusCode, 400); assert.equal(res.payload.error_code, 'UNSUPPORTED_CAPABILITY_FOR_DOMAIN'); assert.equal(res.payload.allowedCapabilities.includes('SHARE_TRAJECTORY'), false);
});
test('domain endpoint rejects non-object input through central router', async () => {
  const res = responseRecorder(); await handleDomainCapabilityRequest('DISCOVERY', request('POST', { capability: 'LIST_TABLES', input: [] }), res);
  assert.equal(res.statusCode, 400); assert.equal(res.payload.error_code, 'INVALID_CAPABILITY_INPUT');
});
test('MARKET endpoint exposes SHARE_TRANSFER and preserves its closed input', async () => {
  const input = { mode: 'HISTORICAL', subject_entity: { level: 'CIDEF_TOTAL' }, comparison_scope: 'TOTAL_MARKET', competitor_level: 'BRAND', temporal_basis: 'MONTHLY_YOY', date_from: '2022-01-01', date_to: '2025-12-31' };
  const res = responseRecorder(); let captured;
  await handleDomainCapabilityRequest('MARKET', request('POST', { capability: 'SHARE_TRANSFER', input }), res, async (payload) => { captured = payload; return { routed: true }; });
  assert.equal(res.statusCode, 200); assert.deepEqual(captured, { domain: 'MARKET', capability: 'SHARE_TRANSFER', input }); assert.ok(res.payload.result.routed);
});
test('MARKET endpoint exposes GROWTH_MATRIX and preserves its closed input', async () => {
  const input = { date_from: '2022-01-01', date_to: '2025-12-31', comparison_scopes: ['TOTAL_MARKET'], temporal_comparisons: ['YOY_MONTH'] };
  const res = responseRecorder(); let captured;
  await handleDomainCapabilityRequest('MARKET', request('POST', { capability: 'GROWTH_MATRIX', input }), res, async (payload) => { captured = payload; return { routed: true }; });
  assert.equal(res.statusCode, 200); assert.deepEqual(captured, { domain: 'MARKET', capability: 'GROWTH_MATRIX', input });
});
