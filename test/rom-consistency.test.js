import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEALER_ANALYTICS_MOTORS, isDealerAnalyticsMotor } from '../lib/public-motors.js';
import { listAnalyticTables } from '../lib/motors/allowed-tables.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expectedMotors = [
  'table_schema',
  'profile_table',
  'query_table',
  'join_tables',
  'vin_olap',
];
const expectedRom = [
  'catalog.md',
  'instructions.md',
  'motors.md',
  'schema.json',
  'vin-cube.md',
];

function schema() {
  return JSON.parse(readFileSync(join(root, 'rom/schema.json'), 'utf8'));
}

test('dealer router, backend registry and OpenAPI expose the same motors', () => {
  const schemaMotors = schema().components.schemas.RouterRequest.properties.motor.enum;
  const registry = readFileSync(join(root, 'lib/motors/index.js'), 'utf8');
  const registered = [...registry.matchAll(/^  ([a-z0-9_]+): /gm)].map((match) => match[1]);
  assert.deepEqual(DEALER_ANALYTICS_MOTORS, expectedMotors);
  assert.deepEqual(schemaMotors, expectedMotors);
  for (const motor of expectedMotors) assert.ok(registered.includes(motor), `${motor} is not registered`);
});

test('motors ROM declares only the public motors as AVAILABLE', () => {
  const markdown = readFileSync(join(root, 'rom/motors.md'), 'utf8');
  const available = markdown.split(/^## AVAILABLE\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const declared = [...available.matchAll(/^### `([a-z0-9_]+)`$/gm)].map((match) => match[1]);
  assert.deepEqual(declared, expectedMotors);
});

test('ROM structure is atomic and exact', () => {
  assert.deepEqual(readdirSync(join(root, 'rom')).sort(), expectedRom);
});

test('catalog and OpenAPI table enum match allowed-tables', () => {
  const allowed = listAnalyticTables();
  const markdown = readFileSync(join(root, 'rom/catalog.md'), 'utf8');
  const catalog = [...markdown.matchAll(/^\- `([a-z0-9_]+)`:/gm)].map((match) => match[1]).sort();
  const schemaTables = [...schema().components.schemas.AnalyticTable.enum].sort();
  assert.deepEqual(catalog, allowed);
  assert.deepEqual(schemaTables, allowed);
});

test('OpenAPI exposes vin_olap operations without adding a motor', () => {
  const document = schema();
  const input = document.components.schemas.VinOlapInput;
  assert.deepEqual(input.properties.operation.enum,['AGGREGATE','TEMPORAL_BOUNDARY']);
  assert.deepEqual(input.properties.boundary.enum,['MIN','MAX']);
  assert.equal(input.properties.operation.default,'AGGREGATE');
});

test('non-public backend motor remains forbidden for dealer_analytics', () => {
  assert.equal(isDealerAnalyticsMotor('rvm_market_pareto'), false);
  assert.equal(isDealerAnalyticsMotor('vin_olap'), true);
  const router = readFileSync(join(root, 'api/router.js'), 'utf8');
  assert.match(router, /\? isDealerAnalyticsMotor\(motorName\)/);
  assert.match(router, /if \(!motorAllowed\)/);
});
