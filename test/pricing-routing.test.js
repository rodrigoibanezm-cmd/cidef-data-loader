import test from 'node:test';
import assert from 'node:assert/strict';
import { listDomainCapabilities, resolveDomainCapability } from '../lib/custom-gpt/capabilityRegistry.js';

test('PRICING exposes HISTORY only', () => {
  assert.deepEqual(listDomainCapabilities('PRICING'), ['HISTORY']);
  assert.deepEqual(resolveDomainCapability('pricing','history'), {
    domain:'PRICING', capability:'HISTORY', action:'pricing_history_v01'
  });
});

test('PRICING rejects unsupported capabilities', () => {
  assert.throws(() => resolveDomainCapability('PRICING','UNIVERSE'), /UNSUPPORTED_CAPABILITY_FOR_DOMAIN/);
});
