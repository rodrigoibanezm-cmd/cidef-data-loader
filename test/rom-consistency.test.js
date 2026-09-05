import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DOMAIN_CAPABILITY_REGISTRY } from '../lib/custom-gpt-router.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expectedRom = [
  'catalog.md',
  'instructions.md',
  'intake.md',
  'orchestrator.md',
  'render-production.md',
  'render.md',
  'schema.json',
];
function schema() { return JSON.parse(readFileSync(join(root, 'rom/schema.json'), 'utf8')); }
const requestSchemaByDomain = Object.freeze({ SALES: 'SalesRequest', MARKET: 'MarketRequest', DISCOVERY: 'DiscoveryRequest', LONGITUDINAL: 'LongitudinalRequest' });

test('domain registry and OpenAPI expose the same public capabilities', () => {
  const value = schema();
  for (const [domain, requestSchema] of Object.entries(requestSchemaByDomain)) {
    const documented = value.components.schemas[requestSchema].properties.capability.enum;
    const registered = Object.keys(DOMAIN_CAPABILITY_REGISTRY[domain]);
    assert.deepEqual(new Set(documented), new Set(registered), domain);
    assert.equal(new Set(documented).size, documented.length, `${domain} contains duplicate capabilities`);
  }
});
test('vin growth diagnostic contract is explicit in OpenAPI', () => {
  const schemas = schema().components.schemas;
  assert.ok(schemas.SalesRequest.properties.capability.enum.includes('VIN_GROWTH_DIAGNOSTIC'));
  assert.deepEqual(schemas.VinGrowthDiagnosticInput.required, ['brand_id', 'store_id', 'current_month']);
  assert.equal(schemas.VinGrowthDiagnosticInput.additionalProperties, false);
  assert.equal(schemas.VinGrowthDiagnosticOutput.properties.motor.const, 'vin_growth_diagnostic_v01');
  assert.equal(schemas.VinGrowthDiagnosticOutput.properties.version.const, '0.1');
  assert.deepEqual(schemas.VinGrowthDiagnosticOutput.properties.status.enum, ['COMPLETE', 'PARTIAL']);
  assert.deepEqual(schemas.Direction.enum, ['POSITIVE', 'NEGATIVE', 'FLAT', 'NOT_EVALUABLE']);
  assert.deepEqual(schemas.PctStatus.enum, ['EVALUABLE', 'NOT_EVALUABLE_ZERO_BASE', 'NOT_EVALUABLE_SOURCE']);
  assert.deepEqual(schemas.ActivityTransition.enum, ['NEW_ACTIVITY', 'CEASED_ACTIVITY', 'CONTINUING_ACTIVITY', 'NO_ACTIVITY']);
  assert.deepEqual(schemas.DiagnosticRelation.enum, ['SAME_DIRECTION', 'OPPOSITE_DIRECTION', 'STORE_MOVED_CONTEXT_FLAT', 'STORE_FLAT_CONTEXT_MOVED', 'BOTH_FLAT', 'NOT_EVALUABLE']);
});
test('ROM structure is atomic and exact', () => assert.deepEqual(readdirSync(join(root, 'rom')).sort(), expectedRom));
