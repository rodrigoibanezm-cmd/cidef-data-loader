import { neon } from '@neondatabase/serverless';

const TABLES = new Set([
  'inventario_vehiculos_global_raw',
  'notas_venta_raw',
  'estadisticas_venta_raw',
]);
const PERIODS = new Set(['month', 'quarter', 'year']);
const AGGS = new Set(['count', 'sum', 'avg']);

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

const qi = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function getColumns(sql, table) {
  const rows = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  return new Set(rows.map((r) => r.column_name));
}

export async function run(input = {}) {
  const {
    table,
    date_column,
    period = 'month',
    metric = { op: 'count', as: 'count' },
    group_by = [],
  } = input;

  if (!TABLES.has(table)) throw new Error('Table not allowed');
  if (!PERIODS.has(period)) throw new Error('Invalid period');
  if (!AGGS.has(metric.op)) throw new Error('Invalid metric');

  const sql = db();
  const columns = await getColumns(sql, table);
  if (!columns.has(date_column)) throw new Error('Invalid date column');
  if (group_by.some((c) => !columns.has(c))) throw new Error('Invalid group_by');
  if (metric.op !== 'count' && !columns.has(metric.column)) throw new Error('Invalid metric column');

  const dateExpr = `to_date(split_part(NULLIF(${qi(date_column)}, ''), ' ', 1), 'MM/DD/YY')`;
  const bucket = `date_trunc('${period}', ${dateExpr})::date`;
  const metricExpr = metric.op === 'count'
    ? 'COUNT(*)'
    : `${metric.op.toUpperCase()}(NULLIF(${qi(metric.column)}, '')::numeric)`;

  const select = [
    `${bucket} AS period`,
    ...group_by.map(qi),
    `${metricExpr} AS ${qi(metric.as || metric.op)}`,
  ].join(', ');
  const group = [`${bucket}`, ...group_by.map(qi)].join(', ');
  const limit = Math.min(Math.max(Number(input.limit) || 500, 1), 1000);

  const rows = await sql.query(`
    SELECT ${select}
    FROM ${qi(table)}
    WHERE NULLIF(${qi(date_column)}, '') IS NOT NULL
    GROUP BY ${group}
    ORDER BY period ASC
    LIMIT ${limit}`);

  return { table, date_column, period, rowsReturned: rows.length, rows };
}
