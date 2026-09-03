import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/custom-gpt.js';

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('custom GPT endpoint exposes router contract version on every response', async () => {
  for (const req of [{ method: 'GET' }, { method: 'POST', body: {} }]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.body.router_version, '1.43.0');
  }
});

test('custom GPT endpoint advertises and dispatches seller change contribution action', async () => {
  const advertised = response();
  await handler({ method: 'POST', body: {} }, advertised);
  assert.ok(advertised.body.allowedActions.includes('ventas_seller_change_contribution_v01'));

  const dispatched = response();
  await handler({ method: 'POST', body: {
    action: 'ventas_seller_change_contribution_v01',
    input: { period_a: '2026-07', period_b: '2026-07' },
  } }, dispatched);
  assert.equal(dispatched.body.action, 'ventas_seller_change_contribution_v01');
  assert.match(dispatched.body.error, /period_a must be before period_b/);
  assert.doesNotMatch(dispatched.body.error, /Unknown Custom GPT action/);
});

test('custom GPT endpoint advertises and dispatches store change contribution action', async () => {
  const advertised = response();
  await handler({ method: 'POST', body: {} }, advertised);
  assert.ok(advertised.body.allowedActions.includes('ventas_store_change_contribution_v01'));

  const dispatched = response();
  await handler({ method: 'POST', body: {
    action: 'ventas_store_change_contribution_v01',
    input: { period_a: '2026-07', period_b: '2026-07' },
  } }, dispatched);
  assert.equal(dispatched.body.action, 'ventas_store_change_contribution_v01');
  assert.match(dispatched.body.error, /period_a must be before period_b/);
  assert.doesNotMatch(dispatched.body.error, /Unknown Custom GPT action/);
});

test('custom GPT endpoint advertises product change contribution action', async () => {
  const res = response();
  await handler({ method: 'POST', body: {} }, res);
  assert.ok(res.body.allowedActions.includes('ventas_product_change_contribution_v01'));
});

test('custom GPT endpoint dispatches product change contribution through the real router', async () => {
  const res = response();
  await handler({
    method: 'POST',
    body: {
      action: 'ventas_product_change_contribution_v01',
      input: { period_a: '2026-07', period_b: '2026-07' },
    },
  }, res);
  assert.equal(res.body.action, 'ventas_product_change_contribution_v01');
  assert.match(res.body.error, /period_a must be before period_b/);
  assert.doesNotMatch(res.body.error, /Unknown Custom GPT action/);
});
