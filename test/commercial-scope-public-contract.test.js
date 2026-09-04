import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMAIN_CAPABILITY_REGISTRY } from '../lib/custom-gpt/capabilityRegistry.js';
import { ventasCommercialContextV01 } from '../lib/motors/ventas-commercial-context-v01.js';

const schema = JSON.parse(readFileSync(new URL('../rom/schema.json', import.meta.url), 'utf8'));
const salesCapabilities = schema.components.schemas.SalesRequest.properties.capability.enum;
const salesInput = schema.components.schemas.SalesInput.properties;
const longitudinalInput = schema.components.schemas.LongitudinalInput.properties;

const expectedUniverses = ['COMPANY', 'OWN_STORES', 'DEALERS'];

test('public SALES schema exposes the registered COMMERCIAL_CONTEXT capability', () => {
  assert.equal(DOMAIN_CAPABILITY_REGISTRY.SALES.COMMERCIAL_CONTEXT.action, 'ventas_commercial_context_v01');
  assert.ok(salesCapabilities.includes('COMMERCIAL_CONTEXT'));
});

test('public SALES input exposes the certified commercial universes', () => {
  assert.deepEqual(salesInput.commercial_universe.enum, expectedUniverses);
});

test('public longitudinal input allows explicit commercial_universe for VENTAS', () => {
  assert.deepEqual(longitudinalInput.commercial_universe.enum, expectedUniverses);
  assert.equal(schema.components.schemas.LongitudinalInput.additionalProperties, false);
});

test('public commercial context fails closed when commercial_universe is omitted', async () => {
  await assert.rejects(
    () => ventasCommercialContextV01({}),
    (error) => error?.code === 'MISSING_COMMERCIAL_UNIVERSE',
  );
});
