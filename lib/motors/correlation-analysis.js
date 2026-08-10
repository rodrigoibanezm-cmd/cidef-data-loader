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
  const xColumn = String(input.x_column || '');
  const yColumn = String(input.y_column || '');

  if (!TABLES.has(table)) throw new Error('Invalid table');
  if (!xColumn || !yColumn) throw new Error('Missing x_column or y_column');

  const t = ident(table);
  const x = ident(xColumn);
  const y = ident(yColumn);
  const xv = `NULLIF(TRIM(${x}::text), '')::numeric`;
  const yv = `NULLIF(TRIM(${y}::text), '')::numeric`;
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  const rows = await sql.query(`
    WITH clean AS (
      SELECT ${xv} AS x, ${yv} AS y
      FROM ${t}
      WHERE NULLIF(TRIM(${x}::text), '') IS NOT NULL
        AND NULLIF(TRIM(${y}::text), '') IS NOT NULL
    )
    SELECT
      COUNT(*)::int AS n,
      CORR(x, y) AS correlation,
      REGR_SLOPE(y, x) AS slope,
      REGR_INTERCEPT(y, x) AS intercept,
      AVG(x) AS avg_x,
      AVG(y) AS avg_y
    FROM clean
  `);

  return { table, x_column: xColumn, y_column: yColumn, ...rows[0] };
}
