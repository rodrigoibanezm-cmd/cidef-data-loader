import { neon } from '@neondatabase/serverless';

const TABLES = new Set(['inventario_vehiculos_global_raw','notas_venta_raw','estadisticas_venta_raw','lista_precios_raw']);
const PERIODS = new Set(['month','quarter','year']);
const OPS = new Set(['count','sum','avg']);

function ident(v) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error('Invalid identifier');
  return `"${v}"`;
}

export async function run(input = {}) {
  const table = String(input.table || '');
  const dateColumn = String(input.date_column || '');
  const period = String(input.period || 'month');
  const groupBy = input.group_by ? String(input.group_by) : null;
  const metric = input.metric || { op: 'count', as: 'n' };
  const op = String(metric.op || 'count').toLowerCase();
  const limit = Math.min(Math.max(Number(input.limit) || 200, 1), 500);

  if (!TABLES.has(table)) throw new Error('Invalid table');
  if (!dateColumn) throw new Error('Missing date_column');
  if (!PERIODS.has(period)) throw new Error('Invalid period');
  if (!OPS.has(op)) throw new Error('Invalid metric operation');

  const t = ident(table), d = ident(dateColumn);
  const g = groupBy ? ident(groupBy) : null;
  let expr = 'COUNT(*)::numeric';
  if (op !== 'count') {
    if (!metric.column) throw new Error('Missing metric column');
    const c = ident(String(metric.column));
    expr = `${op.toUpperCase()}(NULLIF(TRIM(${c}::text), '')::numeric)`;
  }

  const groupSelect = g ? `${g} AS group_value,` : `NULL::text AS group_value,`;
  const groupSql = g ? `, ${g}` : '';
  const partition = g ? 'PARTITION BY group_value ' : '';
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  const rows = await sql.query(`
    WITH base AS (
      SELECT ${groupSelect}
        date_trunc('${period}', TO_TIMESTAMP(${d}, 'MM/DD/YY HH24:MI')) AS period,
        ${expr} AS value
      FROM ${t}
      WHERE NULLIF(TRIM(${d}::text), '') IS NOT NULL
      GROUP BY date_trunc('${period}', TO_TIMESTAMP(${d}, 'MM/DD/YY HH24:MI'))${groupSql}
    ), lagged AS (
      SELECT *, LAG(value) OVER (${partition}ORDER BY period) AS previous_value
      FROM base
    )
    SELECT group_value, period, value, previous_value,
      value - previous_value AS change_abs,
      CASE WHEN previous_value IS NULL OR previous_value = 0 THEN NULL
           ELSE ROUND(((value - previous_value) / previous_value) * 100, 2) END AS change_pct
    FROM lagged
    ORDER BY period DESC, group_value NULLS FIRST
    LIMIT ${limit}
  `);

  return { table, date_column: dateColumn, period, group_by: groupBy, rowsReturned: rows.length, rows };
}
