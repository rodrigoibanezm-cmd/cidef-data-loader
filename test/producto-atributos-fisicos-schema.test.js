import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ddl = readFileSync(
  join(root, 'sql/master/028_producto_atributos_fisicos_v01.sql'),
  'utf8',
);

test('schema is DDL-only and depends on btree_gist', () => {
  assert.match(ddl, /CREATE EXTENSION IF NOT EXISTS btree_gist/i);
  assert.doesNotMatch(ddl, /^\s*INSERT\s+INTO\b/im);
  assert.doesNotMatch(ddl, /^\s*COPY\b/im);
});

test('physical attribute grain is exactly MODEL xor VERSION', () => {
  assert.match(ddl, /modelo_id bigint REFERENCES modelos_master_v01\(modelo_id\)/i);
  assert.match(ddl, /version_id bigint REFERENCES versiones_master_v01\(version_id\)/i);
  assert.match(ddl, /\(modelo_id IS NOT NULL\) <> \(version_id IS NOT NULL\)/i);
});

test('V0.1 attribute, unit, source and status catalogs are closed', () => {
  assert.match(ddl, /attribute IN \('length_mm','wheelbase_mm'\)/i);
  assert.match(ddl, /CHECK \(value > 0\)/i);
  assert.match(ddl, /CHECK \(unit = 'mm'\)/i);
  for (const source of ['HOMOLOGATION', 'MANUFACTURER_CHILE', 'MANUFACTURER_GLOBAL', 'STRUCTURED_EXTERNAL']) {
    assert.match(ddl, new RegExp(source));
  }
  assert.match(ddl, /status IN \('CERTIFIED','CONFLICT','SUPERSEDED'\)/i);
});

test('validity is half-open and certified overlaps are excluded per grain', () => {
  assert.match(ddl, /valid_to IS NULL OR valid_to > valid_from/i);
  assert.match(ddl, /ex_atributo_fisico_model_certified/i);
  assert.match(ddl, /ex_atributo_fisico_version_certified/i);
  assert.match(ddl, /daterange\([^;]+?'\[\)'\) WITH &&/is);
});

test('cross-grain trigger resolves parent model and locks it', () => {
  assert.match(ddl, /validate_atributo_fisico_cross_grain_v01/i);
  assert.match(ddl, /FROM versiones_master_v01 WHERE version_id = NEW\.version_id/i);
  assert.match(ddl, /WHERE modelo_id = parent_modelo_id FOR UPDATE/i);
});

test('cross-grain trigger checks MODEL against child VERSION rows', () => {
  assert.match(ddl, /JOIN versiones_master_v01 v ON v\.version_id = a\.version_id/i);
  assert.match(ddl, /v\.modelo_id = parent_modelo_id/i);
  assert.match(ddl, /a\.attribute = NEW\.attribute/i);
  assert.match(ddl, /&& new_period/i);
});

test('cross-grain trigger checks VERSION against parent MODEL and UPDATE', () => {
  assert.match(ddl, /a\.modelo_id = parent_modelo_id/i);
  assert.match(ddl, /BEFORE INSERT OR UPDATE ON producto_atributos_fisicos_v01/i);
  assert.match(ddl, /RAISE EXCEPTION 'CERTIFIED physical attribute overlaps MODEL\/VERSION grain'/i);
});
