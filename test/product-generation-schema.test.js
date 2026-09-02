import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SQL_PATH = new URL('../sql/master/028_producto_generation_schema_v01.sql', import.meta.url);

test('generation schema preserves canonical hierarchy and unresolved state', async () => {
  const sql = await readFile(SQL_PATH, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS generaciones_master_v01/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS version_generation_v01/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS generation_evidence_v01/);
  assert.match(sql, /status IN \('RESOLVED','UNRESOLVED','CONFLICT'\)/);
  assert.match(sql, /VALUES \(NEW\.version_id, NULL, 'UNRESOLVED'\)/);
  assert.match(sql, /SELECT version_id, NULL, 'UNRESOLVED'/);
});

test('generation schema protects VERSION and GENERATION model identity', async () => {
  const sql = await readFile(SQL_PATH, 'utf8');
  assert.match(sql, /validate_version_generation_model_v01/);
  assert.match(sql, /VERSION and GENERATION must belong to the same MODEL/);
  assert.doesNotMatch(sql, /NX4|SX2|ALL NEW/);
});
