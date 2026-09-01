import { assertTable } from './catalog.js';
import { columnsFor, customGptDb, qi } from './db.js';

export async function profileTable(input) {
  const table = assertTable(input.table);
  const sql = customGptDb();
  const columns = await columnsFor(sql, table);
  const requested = Array.isArray(input.columns) && input.columns.length
    ? input.columns
    : columns.slice(0, 12).map((column) => column.column_name);
  const known = new Set(columns.map((column) => column.column_name));
  if (requested.some((column) => !known.has(column))) throw new Error('Invalid column');

  const [{ count }] = await sql.query(`SELECT COUNT(*)::bigint AS count FROM ${qi(table)}`);
  const profile = [];

  for (const column of requested) {
    const col = qi(column);
    const [stats] = await sql.query(
      `SELECT COUNT(*) FILTER (WHERE ${col} IS NULL OR ${col}::text='')::bigint AS nulls,
              COUNT(DISTINCT NULLIF(${col}::text,''))::bigint AS distinct_count,
              MIN(NULLIF(${col}::text,'')) AS min_value,
              MAX(NULLIF(${col}::text,'')) AS max_value
       FROM ${qi(table)}`,
    );
    const topValues = await sql.query(
      `SELECT ${col}::text AS value, COUNT(*)::bigint AS count
       FROM ${qi(table)}
       WHERE ${col} IS NOT NULL AND ${col}::text <> ''
       GROUP BY ${col}::text
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
    );
    profile.push({
      column,
      nulls: Number(stats.nulls),
      distinct: Number(stats.distinct_count),
      min: stats.min_value,
      max: stats.max_value,
      topValues: topValues.map((row) => ({ value: row.value, count: Number(row.count) })),
    });
  }

  return { table, rows: Number(count), profile };
}
