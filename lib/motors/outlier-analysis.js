import { neon } from '@neondatabase/serverless';

const TABLES = new Set(['inventario_vehiculos_global_raw','notas_venta_raw','estadisticas_venta_raw','lista_precios_raw']);

function ident(v) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error('Invalid identifier');
  return `"${v}"`;
}

export async function run(input = {}) {
  const table = String(input.table || '');
  const column = String(input.column || '');
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  if (!TABLES.has(table)) throw new Error('Invalid table');
  if (!column) throw new Error('Missing column');

  const t = ident(table), c = ident(column);
  const v = `NULLIF(TRIM(${c}::text), '')::numeric`;
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const rows = await sql.query(`
    WITH stats AS (
      SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY ${v}) AS q1,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY ${v}) AS q3
      FROM ${t} WHERE NULLIF(TRIM(${c}::text), '') IS NOT NULL
    ), bounds AS (
      SELECT q1, q3, q3-q1 AS iqr,
             q1 - 1.5*(q3-q1) AS lower_bound,
             q3 + 1.5*(q3-q1) AS upper_bound
      FROM stats
    )
    SELECT ${c} AS value, b.q1, b.q3, b.iqr, b.lower_bound, b.upper_bound,
           CASE WHEN ${v} < b.lower_bound THEN 'low' ELSE 'high' END AS side
    FROM ${t} CROSS JOIN bounds b
    WHERE NULLIF(TRIM(${c}::text), '') IS NOT NULL
      AND (${v} < b.lower_bound OR ${v} > b.upper_bound)
    ORDER BY ABS(${v} - CASE WHEN ${v} < b.lower_bound THEN b.lower_bound ELSE b.upper_bound END) DESC
    LIMIT ${limit}
  `);
  const countRows = await sql.query(`
    WITH s AS (
      SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY ${v}) q1,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY ${v}) q3
      FROM ${t} WHERE NULLIF(TRIM(${c}::text), '') IS NOT NULL
    )
    SELECT COUNT(*)::int AS outlier_count
    FROM ${t}, s
    WHERE NULLIF(TRIM(${c}::text), '') IS NOT NULL
      AND (${v} < q1-1.5*(q3-q1) OR ${v} > q3+1.5*(q3-q1))
  `);
  return { table, column, method: 'iqr_1.5', outlier_count: countRows[0].outlier_count, rowsReturned: rows.length, rows };
}
