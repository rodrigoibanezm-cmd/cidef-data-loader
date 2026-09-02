import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('product generation action is registered in router and schema', async () => {
  const [router, schema] = await Promise.all([
    read('lib/custom-gpt-router.js'),
    read('rom/schema.json'),
  ]);
  assert.match(router, /product_generation_context_v01: productGenerationContextV01/);
  assert.match(schema, /"product_generation_context_v01"/);
});

test('generation master tables are exposed through controlled table actions', async () => {
  const [catalog, schema] = await Promise.all([
    read('lib/custom-gpt/catalog.js'),
    read('rom/schema.json'),
  ]);
  for (const table of [
    'generaciones_master_v01',
    'version_generation_v01',
    'generation_evidence_v01',
  ]) {
    assert.match(catalog, new RegExp(table));
    assert.match(schema, new RegExp(table));
  }
});
