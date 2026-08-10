import { neon } from '@neondatabase/serverless';

const TABLES = new Set([
  'inventario_vehiculos_global_raw',
  'notas_venta_raw',
  'estadisticas_venta_raw',
  'lista_precios_raw',
]);
const OPS = new Set(['count', 'sum', 'avg', 'min', 'max']);

function ident(v) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error('Invalid identifier');
  return `"${v}"`;
}

export async function run(input = {}) {
  const table = String(input.table || '');
  const groupBy = String(input.group_by || '');
  const metric = input.metric || { op: 'count', as: 'n' };
  const op = String(metric.op || 'count').toLowerCase();
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);

  if (!TABLES.has(table)) throw new Error('Invalid table');
  if (!groupBy) throw new Error('Missing group_by');
  if (!OPS.has(op)) throw new Error('Invalid metric operation');

  const t = ident(table);
  const g = ident(groupBy);
  const alias = ident(String(metric.as || op));
  let expression = 'COUNT(*)';

  if (op !== 'count') {
    if (!metric.column) throw new Error('Missing metric column');
    const c = ident(String(metric.column));
    expression = `${op.toUpperCase()}(NULLIF(TRIM(${c}::text), '')::numeric)`;
  }

  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const rows = await sql.query(`
    SELECT ${g} AS group_value, ${expression} AS ${alias}
    FROM ${t}
    WHERE ${g} IS NOT NULL AND TRIM(${g}::text) <> ''
    GROUP BY ${g}
    ORDER BY ${alias} DESC NULLS LAST
    LIMIT ${limit}
  `);

  return { table, group_by: groupBy, metric: { op, column: metric.column || null, as: metric.as || op }, rowsReturned: rows.length, rows };
}
