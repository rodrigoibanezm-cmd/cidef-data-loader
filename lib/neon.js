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

export async function replaceTableSnapshot(tableName, columns, rows) {
  if (!columns.length) throw new Error('No columns to load');
  const sql = db();
  const staging = stagingName(tableName);
  const columnSql = columns.map((name) => `${quoteIdent(name)} TEXT`).join(', ');

  await sql.query(`CREATE TABLE ${quoteIdent(staging)} (${columnSql})`);

  const maxParams = 60000;
  const batchSize = Math.max(1, Math.min(750, Math.floor(maxParams / columns.length)));
  const columnList = columns.map(quoteIdent).join(', ');

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
      await sql.query(query, values);
    }

    await sql.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
    await sql.query(`ALTER TABLE ${quoteIdent(staging)} RENAME TO ${quoteIdent(tableName)}`);
  } catch (error) {
    await sql.query(`DROP TABLE IF EXISTS ${quoteIdent(staging)}`).catch(() => {});
    throw error;
  }

  return { rowsLoaded: rows.length, columnsLoaded: columns.length, table: tableName };
}
