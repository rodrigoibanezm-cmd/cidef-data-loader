import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = JSON.parse(fs.readFileSync(new URL('../rom/schema.json', import.meta.url), 'utf8'));

test('OpenAPI SemanticParse requires the explicit temporal period', () => {
  const semanticParse = schema.components.schemas.SemanticParse;
  assert.ok(Array.isArray(semanticParse.required));
  assert.ok(semanticParse.required.includes('period'));
  assert.deepEqual(semanticParse.properties.period, { $ref: '#/components/schemas/SemanticPeriod' });
  assert.deepEqual(schema.components.schemas.SemanticPeriod.required, ['date_from', 'date_to']);
  assert.equal(schema.components.schemas.SemanticPeriod.additionalProperties, false);
});
