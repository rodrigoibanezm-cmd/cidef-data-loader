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
    assert.equal(res.body.router_version, '1.39.0');
  }
});
