import { neon } from '@neondatabase/serverless';

function db() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('Missing Neon DATABASE_URL');
  return neon(connectionString);
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function stagingName(tableName) {
  return `${tableName}__loading_${Date.now()}`;
}

async function runWithRetry(fn, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

export async function beginTableSnapshot(tableName, columns) {
  if (!columns.length) throw new Error('No columns to load');
  const sql = db();
  const staging = stagingName(tableName);
  const columnSql = columns.map((name) => `${quoteIdent(name)} TEXT`).join(', ');
  await sql.query(`CREATE TABLE ${quoteIdent(staging)} (${columnSql})`);
  return { tableName, staging, columns };
}

export async function appendTableRows(snapshot, rows) {
  const { staging, columns } = snapshot;
  const sql = db();
  const columnList = columns.map(quoteIdent).join(', ');
  const maxParams = 8000;
  const batchSize = Math.max(1, Math.min(50, Math.floor(maxParams / columns.length)));

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    let param = 1;
    const tuples = batch.map((row) => `(${row.map((value) => {
      values.push(value);
      return `$${param++}`;
    }).join(', ')})`);
    const query = `INSERT INTO ${quoteIdent(staging)} (${columnList}) VALUES ${tuples.join(', ')}`;
    try {
      await runWithRetry(() => sql.query(query, values));
    } catch (error) {
      throw new Error(`Database request failed at row ${offset + 1} (batch=${batchSize}, columns=${columns.length}, params=${values.length}): ${error.message}`);
    }
  }
  return { rowsLoaded: rows.length, batchSize };
}

export async function commitTableSnapshot(snapshot) {
  const sql = db();
  await sql.query(`DROP TABLE IF EXISTS ${quoteIdent(snapshot.tableName)}`);
  await sql.query(`ALTER TABLE ${quoteIdent(snapshot.staging)} RENAME TO ${quoteIdent(snapshot.tableName)}`);
}

export async function abortTableSnapshot(snapshot) {
  const sql = db();
  await sql.query(`DROP TABLE IF EXISTS ${quoteIdent(snapshot.staging)}`).catch(() => {});
}

export async function replaceTableSnapshot(tableName, columns, rows) {
  const snapshot = await beginTableSnapshot(tableName, columns);
  try {
    const result = await appendTableRows(snapshot, rows);
    await commitTableSnapshot(snapshot);
    return { rowsLoaded: rows.length, columnsLoaded: columns.length, table: tableName, batchSize: result.batchSize };
  } catch (error) {
    await abortTableSnapshot(snapshot);
    throw error;
  }
}
