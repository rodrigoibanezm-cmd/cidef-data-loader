import { neon } from '@neondatabase/serverless';

const TABLES = new Set([
  'inventario_vehiculos_global_raw',
  'notas_venta_raw',
  'estadisticas_venta_raw',
  'lista_precios_raw',
]);
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']);
const AGGS = new Set(['count', 'sum', 'avg', 'min', 'max']);

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

function buildFilters(filters, columns, values) {
  return (filters || []).map((f) => {
    if (!columns.has(f.column) || !OPS.has(f.op)) throw new Error('Invalid filter');
    values.push(String(f.value ?? ''));
    const p = `$${values.length}`;
    if (f.op === 'contains') return `${qi(f.column)} ILIKE '%' || ${p} || '%'`;
    const map = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
    return `${qi(f.column)} ${map[f.op]} ${p}`;
  });
}

export async function run(input = {}) {
  const { table, operation = 'select' } = input;
  if (!TABLES.has(table)) throw new Error('Table not allowed');
  if (!['select', 'aggregate'].includes(operation)) throw new Error('Invalid operation');

  const sql = db();
  const columns = await getColumns(sql, table);
  const values = [];
  const whereParts = buildFilters(input.filters, columns, values);
  const where = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';

  if (operation === 'select') {
    const selected = input.columns?.length ? input.columns : [...columns].slice(0, 25);
    if (selected.some((c) => !columns.has(c))) throw new Error('Invalid column');
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 500);
    const rows = await sql.query(`SELECT ${selected.map(qi).join(', ')} FROM ${qi(table)}${where} LIMIT ${limit}`, values);
    return { table, operation, rowsReturned: rows.length, rows };
  }

  const groups = input.group_by || [];
  if (groups.some((c) => !columns.has(c))) throw new Error('Invalid group_by');
  const metrics = input.metrics || [{ op: 'count', as: 'count' }];
  const metricSql = metrics.map((m, i) => {
    if (!AGGS.has(m.op)) throw new Error('Invalid metric');
    if (m.op !== 'count' && !columns.has(m.column)) throw new Error('Invalid metric column');
    const expr = m.op === 'count' ? 'COUNT(*)' : `${m.op.toUpperCase()}(NULLIF(${qi(m.column)}, '')::numeric)`;
    return `${expr} AS ${qi(m.as || `${m.op}_${i + 1}`)}`;
  });
  const select = [...groups.map(qi), ...metricSql].join(', ');
  const group = groups.length ? ` GROUP BY ${groups.map(qi).join(', ')}` : '';
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  const rows = await sql.query(`SELECT ${select} FROM ${qi(table)}${where}${group} LIMIT ${limit}`, values);
  return { table, operation, rowsReturned: rows.length, rows };
}
