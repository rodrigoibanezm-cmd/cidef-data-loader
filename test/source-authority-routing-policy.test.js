import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const instructions = fs.readFileSync(new URL('../rom/instructions.md', import.meta.url), 'utf8');
const intake = fs.readFileSync(new URL('../rom/intake.md', import.meta.url), 'utf8');

function section(text, heading, nextHeading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing ${heading}`);
  const end = nextHeading ? text.indexOf(nextHeading, start + heading.length) : -1;
  return text.slice(start, end === -1 ? undefined : end);
}

const sourceAuthority = section(instructions, '## SOURCE AUTHORITY antes del tool routing', '## Semántica temporal composicional');

test('CIDEF analytical requirements have exclusive CIDEF identity and evidence authority', () => {
  assert.match(sourceAuthority, /CIDEF es autoridad exclusiva de identidad y evidencia analítica/);
  assert.match(sourceAuthority, /Web no puede resolver identidad CIDEF/);
  assert.match(sourceAuthority, /Web no puede validar, completar, enriquecer ni sustituir evidencia CIDEF/);
});

test('CIDEF failure never enables external fallback', () => {
  assert.match(sourceAuthority, /failure\(CIDEF\) != permission\(EXTERNAL\)/);
  for (const state of ['PARTIAL', 'INSUFFICIENT', 'NOT_EVALUABLE', 'identidad no resuelta', 'availability insuficiente', 'execution error']) {
    assert.ok(sourceAuthority.includes(state), state);
  }
  assert.match(intake, /falla o insuficiencia CIDEF no habilita Web ni otra fuente externa como fallback/);
});

test('explicitly external requirements permit external sources', () => {
  assert.match(sourceAuthority, /requirement explícitamente externo, una fuente externa está permitida/);
  assert.match(intake, /requirement explícitamente externo → fuente externa permitida/);
});

test('mixed questions preserve independent requirement authority and provenance', () => {
  assert.match(sourceAuthority, /varios requirements con autoridades distintas/);
  assert.match(sourceAuthority, /rutearse y ejecutarse independientemente/);
  assert.match(sourceAuthority, /manteniendo separada su procedencia durante la síntesis/);
  assert.match(intake, /provenance separado hasta la síntesis/);
});

test('semantic_parse.v1 remains unchanged by source authority policy', () => {
  const fields = section(intake, 'Campos permitidos:', '`period` es obligatorio');
  assert.doesNotMatch(fields, /authority|source|provenance/i);
  assert.match(intake, /La autoridad de fuente NO es un campo de `semantic_parse\.v1`/);
});

test('source authority routing is compositional and explicitly rejects phrase-based routing', () => {
  assert.match(sourceAuthority, /requirement\s*\n→ authority\s*\n→ allowed source\(s\)/);
  assert.match(sourceAuthority, /no se deriva mediante keywords\/regex\/catálogos de frases/);
  assert.match(intake, /no se materializa mediante keywords, regex, tablas o catálogos de frases/);
});

test('policy does not turn mixed or external authority into CIDEF analytical structure', () => {
  assert.match(sourceAuthority, /no crea una nueva familia analítica ni una capability CIDEF/);
  assert.match(intake, /no crea un `question_type`, no crea una familia analítica/);
});
