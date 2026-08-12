import { neon } from '@neondatabase/serverless';

const STAGING = 'rvm_raw__loading';
const PROGRESS = 'rvm_import_progress';

function sql() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('Missing Neon DATABASE_URL');
  return neon(connectionString);
}

function q(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function resetRvmImport(columns) {
  const db = sql();
  await db.query(`DROP TABLE IF EXISTS ${q(STAGING)}`);
  await db.query(`DROP TABLE IF EXISTS ${q(PROGRESS)}`);
  const columnSql = columns.map((name) => `${q(name)} TEXT`).join(', ');
  await db.query(`CREATE TABLE ${q(STAGING)} (${columnSql})`);
  await db.query(`CREATE UNIQUE INDEX ON ${q(STAGING)} (${q('source_file')}, ${q('source_row')})`);
  await db.query(`CREATE TABLE ${q(PROGRESS)} (
    file_name TEXT PRIMARY KEY,
    last_row INTEGER NOT NULL DEFAULT 1,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    rows_loaded BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

export async function ensureProgress(fileName) {
  const db = sql();
  await db.query(`INSERT INTO ${q(PROGRESS)} (file_name) VALUES ($1) ON CONFLICT (file_name) DO NOTHING`, [fileName]);
}

export async function getProgress(fileName) {
  const db = sql();
  const result = await db.query(`SELECT last_row, done, rows_loaded FROM ${q(PROGRESS)} WHERE file_name = $1`, [fileName]);
  return result.rows?.[0] ?? result[0] ?? null;
}

export async function appendRvmRows(columns, rows, fileName, lastRow) {
  if (!rows.length) return;
  const db = sql();
  const columnList = columns.map(q).join(', ');
  const values = [];
  let p = 1;
  const tuples = rows.map((row) => `(${row.map((value) => {
    values.push(value);
    return `$${p++}`;
  }).join(', ')})`);
  await db.query(`INSERT INTO ${q(STAGING)} (${columnList}) VALUES ${tuples.join(', ')} ON CONFLICT (${q('source_file')}, ${q('source_row')}) DO NOTHING`, values);
  await db.query(`UPDATE ${q(PROGRESS)} SET last_row = $2, rows_loaded = GREATEST(rows_loaded, $2 - 1), updated_at = NOW() WHERE file_name = $1`, [fileName, lastRow]);
}

export async function markFileDone(fileName) {
  const db = sql();
  await db.query(`UPDATE ${q(PROGRESS)} SET done = TRUE, updated_at = NOW() WHERE file_name = $1`, [fileName]);
}

export async function importStatus() {
  const db = sql();
  const result = await db.query(`SELECT file_name, last_row, done, rows_loaded FROM ${q(PROGRESS)} ORDER BY file_name`);
  return result.rows ?? result;
}

export async function finishRvmImport() {
  const db = sql();
  await db.query(`DROP TABLE IF EXISTS ${q('rvm_raw')}`);
  await db.query(`ALTER TABLE ${q(STAGING)} RENAME TO ${q('rvm_raw')}`);
  await db.query(`DROP TABLE IF EXISTS ${q(PROGRESS)}`);
}

export async function stagingExists() {
  const db = sql();
  const result = await db.query(`SELECT to_regclass($1) AS name`, [STAGING]);
  const row = result.rows?.[0] ?? result[0];
  return Boolean(row?.name);
}
