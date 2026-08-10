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

export async function replaceTableSnapshot(tableName, columns, rows) {
  if (!columns.length) throw new Error('No columns to load');
  const sql = db();
  const staging = stagingName(tableName);
  const columnSql = columns.map((name) => `${quoteIdent(name)} TEXT`).join(', ');
  const columnList = columns.map(quoteIdent).join(', ');
  const batchSize = 200;

  await sql.query(`CREATE TABLE ${quoteIdent(staging)} (${columnSql})`);

  try {
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const values = [];
      let param = 1;

      const tuples = batch.map((row) => {
        const placeholders = row.map((value) => {
          values.push(value);
          return `$${param++}`;
        });
        return `(${placeholders.join(', ')})`;
      });

      const query = `INSERT INTO ${quoteIdent(staging)} (${columnList}) VALUES ${tuples.join(', ')}`;

      try {
        await runWithRetry(() => sql.query(query, values));
      } catch (error) {
        throw new Error(`Database request failed at row ${offset + 1}: ${error.message}`);
      }
    }

    await sql.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
    await sql.query(`ALTER TABLE ${quoteIdent(staging)} RENAME TO ${quoteIdent(tableName)}`);
  } catch (error) {
    await sql.query(`DROP TABLE IF EXISTS ${quoteIdent(staging)}`).catch(() => {});
    throw error;
  }

  return { rowsLoaded: rows.length, columnsLoaded: columns.length, table: tableName };
}
