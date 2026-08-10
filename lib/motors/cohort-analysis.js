import { neon } from '@neondatabase/serverless';

const TABLES = new Set(['inventario_vehiculos_global_raw','notas_venta_raw','estadisticas_venta_raw','lista_precios_raw']);
function ident(v) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error('Invalid identifier');
  return `"${v}"`;
}

export async function run(input = {}) {
  const table = String(input.table || '');
  const cohortColumn = String(input.cohort_column || '');
  const valueColumn = String(input.value_column || '');
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  if (!TABLES.has(table)) throw new Error('Invalid table');
  if (!cohortColumn) throw new Error('Missing cohort_column');
  if (!valueColumn) throw new Error('Missing value_column');

  const t = ident(table), c = ident(cohortColumn), v = ident(valueColumn);
  const num = `NULLIF(TRIM(${v}::text), '')::numeric`;
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const rows = await sql.query(`
    SELECT ${c} AS cohort,
      COUNT(*)::int AS n,
      COUNT(${num})::int AS n_value,
      AVG(${num}) AS avg,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ${num}) AS median,
      SUM(${num}) AS sum,
      MIN(${num}) AS min,
      MAX(${num}) AS max
    FROM ${t}
    WHERE ${c} IS NOT NULL AND TRIM(${c}::text) <> ''
    GROUP BY ${c}
    ORDER BY n DESC
    LIMIT ${limit}
  `);
  return { table, cohort_column: cohortColumn, value_column: valueColumn, rowsReturned: rows.length, rows };
}
