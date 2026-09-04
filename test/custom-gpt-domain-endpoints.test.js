import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDomainCapabilityRequest } from '../lib/custom-gpt/domainEndpoint.js';
import salesHandler from '../api/custom-gpt/sales.js';
import marketHandler from '../api/custom-gpt/market.js';
import discoveryHandler from '../api/custom-gpt/discovery.js';
import longitudinalHandler from '../api/custom-gpt/longitudinal.js';

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };
}

function request(method = 'POST', body = {}) {
  return { method, body };
}

const endpointBindings = [
  ['SALES', salesHandler, 'MONTHLY_ACTUAL'],
  ['MARKET', marketHandler, 'MARKET_HISTORY'],
  ['DISCOVERY', discoveryHandler, 'LIST_TABLES'],
  ['LONGITUDINAL', longitudinalHandler, 'VENTAS'],
];

for (const [domain, handler, capability] of endpointBindings) {
  test(`${domain} endpoint binds its domain and executes only capability contract`, async () => {
    const res = responseRecorder();
    let captured = null;
    const executor = async (payload) => {
      captured = payload;
      return { routed: true };
    };

    await handleDomainCapabilityRequest(
      domain,
      request('POST', { capability, input: { marker: domain } }),
      res,
      executor,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.domain, domain);
    assert.equal(res.payload.capability, capability);
    assert.deepEqual(captured, {
      domain,
      capability,
      input: { marker: domain },
    });
    assert.equal(typeof handler, 'function');
  });
}

test('domain endpoint rejects non-POST methods', async () => {
  const res = responseRecorder();
  await handleDomainCapabilityRequest('SALES', request('GET'), res, async () => ({}));
  assert.equal(res.statusCode, 405);
  assert.equal(res.payload.ok, false);
  assert.deepEqual(res.payload.allowedCapabilities.includes('MONTHLY_ACTUAL'), true);
});

test('domain endpoint requires capability', async () => {
  const res = responseRecorder();
  await handleDomainCapabilityRequest('MARKET', request('POST', { input: {} }), res, async () => ({}));
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error_code, 'MISSING_CAPABILITY');
});

test('domain endpoint rejects physical action field instead of ignoring it', async () => {
  const res = responseRecorder();
  await handleDomainCapabilityRequest(
    'SALES',
    request('POST', { capability: 'MONTHLY_ACTUAL', action: 'dealer_inventory_aging_v01', input: {} }),
    res,
    async () => ({}),
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error_code, 'UNSUPPORTED_DOMAIN_REQUEST_FIELD');
  assert.match(res.payload.error, /action/);
});

test('domain endpoint rejects capability from another domain', async () => {
  const res = responseRecorder();
  await handleDomainCapabilityRequest(
    'SALES',
    request('POST', { capability: 'SHARE_TRAJECTORY', input: {} }),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error_code, 'UNSUPPORTED_CAPABILITY_FOR_DOMAIN');
  assert.equal(res.payload.allowedCapabilities.includes('SHARE_TRAJECTORY'), false);
});

test('domain endpoint rejects non-object input through central router', async () => {
  const res = responseRecorder();
  await handleDomainCapabilityRequest(
    'DISCOVERY',
    request('POST', { capability: 'LIST_TABLES', input: [] }),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error_code, 'INVALID_CAPABILITY_INPUT');
});
