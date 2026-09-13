import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = JSON.parse(fs.readFileSync(new URL('../rom/schema.json', import.meta.url), 'utf8'));
const instructions = fs.readFileSync(new URL('../rom/instructions.md', import.meta.url), 'utf8');
const intake = fs.readFileSync(new URL('../rom/intake.md', import.meta.url), 'utf8');

const UNITS = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'SEMESTER', 'YEAR'];
const ALIGNMENT_RULES = [
  ['timezone', 'America/Santiago'],
  ['week_start', 'MONDAY'],
  ['quarter_start', 'JAN | APR | JUL | OCT'],
  ['semester_start', 'JAN | JUL'],
];

for (const unit of UNITS) {
  test(`temporal semantic contract declares calendar unit ${unit}`, () => {
    assert.ok(instructions.includes(unit));
    assert.ok(intake.includes(unit));
  });
}

for (const [parameter, value] of ALIGNMENT_RULES) {
  test(`temporal semantic contract fixes ${parameter}`, () => {
    assert.ok(instructions.includes(`${parameter}`));
    assert.ok(instructions.includes(value));
    assert.ok(intake.includes(`${parameter}`));
    assert.ok(intake.includes(value));
  });
}

test('temporal semantic contract is compositional over unit, quantity, closure and anchor', () => {
  for (const operator of ['unit', 'quantity', 'closure', 'anchor']) {
    assert.ok(instructions.includes(operator));
    assert.ok(intake.includes(operator));
  }

  for (const property of [
    'LAST + quantity=1 + unit=X + CLOSED',
    'LAST + quantity=N + unit=X + CLOSED',
    'CURRENT + unit=X',
  ]) {
    assert.ok(instructions.includes(property));
    assert.ok(intake.includes(property));
  }
});

test('LAST + CLOSED excludes partial units and quantity preserves alignment unit', () => {
  assert.match(instructions, /LAST \+ CLOSED[^\n]*nunca incluye una unidad calendario parcial/);
  assert.match(intake, /LAST \+ CLOSED[\s\S]*?nunca incluye una unidad calendario parcial/);
  assert.match(instructions, /quantity[^\n]*no cambia la unidad de alineación/);
  assert.match(intake, /quantity[\s\S]*?no cambia la unidad ni su alineación calendario/);
});

test('OpenAPI SemanticParse requires only the explicit temporal date range', () => {
  const semanticParse = schema.components.schemas.SemanticParse;
  assert.ok(Array.isArray(semanticParse.required));
  assert.ok(semanticParse.required.includes('period'));
  assert.deepEqual(semanticParse.properties.period, { $ref: '#/components/schemas/SemanticPeriod' });
  assert.deepEqual(schema.components.schemas.SemanticPeriod.required, ['date_from', 'date_to']);
  assert.equal(schema.components.schemas.SemanticPeriod.additionalProperties, false);

  for (const internalOperator of ['unit', 'quantity', 'closure', 'anchor']) {
    assert.equal(schema.components.schemas.SemanticPeriod.properties?.[internalOperator], undefined);
  }
});
