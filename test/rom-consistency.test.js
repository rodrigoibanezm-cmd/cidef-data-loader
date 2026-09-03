import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expectedRom = [
  'catalog.md',
  'instructions.md',
  'intake.md',
  'motors.md',
  'render-production.md',
  'render.md',
  'schema.json',
  'vin-cube.md',
];

function schema() {
  return JSON.parse(readFileSync(join(root, 'rom/schema.json'), 'utf8'));
}

function routerActions() {
  const source = readFileSync(join(root, 'lib/custom-gpt-router.js'), 'utf8');
  const registry = source.split('const ACTIONS = Object.freeze({')[1]?.split('\n});')[0] ?? '';
  return [...registry.matchAll(/^  ([a-z0-9_]+):/gm)].map((match) => match[1]);
}

function documentedAvailable() {
  const markdown = readFileSync(join(root, 'rom/motors.md'), 'utf8');
  const available = markdown.split(/^## AVAILABLE\s*$/m)[1]?.split(/^## NOT AVAILABLE\s*$/m)[0] ?? '';
  return [...available.matchAll(/^### `([a-z0-9_]+)`$/gm)].map((match) => match[1]);
}

test('custom GPT router, OpenAPI and AVAILABLE documentation expose the same actions', () => {
  const schemaActions = schema().components.schemas.CustomGptRequest.properties.action.enum;
  assert.deepEqual(new Set(routerActions()), new Set(schemaActions));
  assert.deepEqual(new Set(documentedAvailable()), new Set(schemaActions));
  assert.equal(new Set(schemaActions).size, schemaActions.length);
});

test('router implementation and OpenAPI publish the same contract version', () => {
  const api = readFileSync(join(root, 'api/custom-gpt.js'), 'utf8');
  const routerVersion = api.match(/ROUTER_VERSION = '([^']+)'/)?.[1];
  assert.equal(routerVersion, schema().info.version);
});

test('NOT AVAILABLE actions do not overlap the productive action enum', () => {
  const markdown = readFileSync(join(root, 'rom/motors.md'), 'utf8');
  const unavailable = markdown.split(/^## NOT AVAILABLE\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const names = [...unavailable.matchAll(/^- `([a-z0-9_]+)`$/gm)].map((match) => match[1]);
  const schemaActions = new Set(schema().components.schemas.CustomGptRequest.properties.action.enum);
  assert.ok(names.every((name) => !schemaActions.has(name)));
});

test('ROM structure is atomic and exact', () => {
  assert.deepEqual(readdirSync(join(root, 'rom')).sort(), expectedRom);
});
