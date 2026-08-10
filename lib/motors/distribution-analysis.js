import { neon } from '@neondatabase/serverless';

const TABLES = new Set([
  'inventario_vehiculos_global_raw',
  'notas_venta_raw',
  'estadisticas_venta_raw',
  'lista_precios_raw',
]);

function ident(v) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error('Invalid identifier');
  return `"${v}"`;
}

export async function run(input = {}) {
  const table = String(input.table || '');
  const column = String(input.column || '');
  if (!TABLES.has(table)) throw new Error('Invalid table');
  if (!column) throw new Error('Missing column');

  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const c = ident(column);
  const t = ident(table);
  const value = `NULLIF(TRIM(${c}::text), '')::numeric`;

  const rows = await sql.query(`
    SELECT
      COUNT(${value})::int AS n,
      MIN(${value}) AS min,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY ${value}) AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY ${value}) AS median,
      AVG(${value}) AS avg,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY ${value}) AS p75,
      percentile_cont(0.90) WITHIN GROUP (ORDER BY ${value}) AS p90,
      MAX(${value}) AS max
    FROM ${t}
    WHERE NULLIF(TRIM(${c}::text), '') IS NOT NULL
  `);

  return { table, column, distribution: rows[0] };
}
