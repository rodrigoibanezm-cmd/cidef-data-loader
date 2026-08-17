import { neon } from '@neondatabase/serverless';
import { assertAnalyticTable } from './allowed-tables.js';

const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null']);
const AGGS = new Set(['count', 'sum', 'avg', 'min', 'max']);

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

const qi = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function getColumns(sql, table) {
  const rows = await sql.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

function buildFilters(filters, columns, values) {
  return (filters || []).map((f) => {
    if (!columns.has(f.column) || !OPS.has(f.op)) throw new Error('Invalid filter');
    const col = qi(f.column);
    if (f.op === 'is_null') return `${col} IS NULL`;
    if (f.op === 'not_null') return `${col} IS NOT NULL`;
    if (f.op === 'contains') {
      values.push(String(f.value ?? ''));
      return `${col}::text ILIKE '%' || $${values.length} || '%'`;
    }
    if (f.op === 'in') {
      const list = Array.isArray(f.value) ? f.value : [];
      if (!list.length) throw new Error('Invalid in filter');
      const placeholders = list.map((v) => {
        values.push(String(v));
        return `$${values.length}`;
      });
      return `${col}::text IN (${placeholders.join(', ')})`;
    }
    values.push(String(f.value ?? ''));
    const p = `$${values.length}`;
    const map = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
    return `${col}::text ${map[f.op]} ${p}`;
  });
}

function buildOrder(orderBy, columns) {
  const items = Array.isArray(orderBy) ? orderBy : [];
  if (!items.length) return '';
  const parts = items.map((o) => {
    if (!columns.has(o.column)) throw new Error('Invalid order column');
    const direction = String(o.direction || 'asc').toLowerCase();
    if (!['asc', 'desc'].includes(direction)) throw new Error('Invalid order direction');
    return `${qi(o.column)} ${direction.toUpperCase()} NULLS LAST`;
  });
  return ` ORDER BY ${parts.join(', ')}`;
}

export async function run(input = {}) {
  const { table, operation = 'select' } = input;
  assertAnalyticTable(table);
  if (!['select', 'aggregate'].includes(operation)) throw new Error('Invalid operation');

  const sql = db();
  const columns = await getColumns(sql, table);
  if (!columns.size) throw new Error('Table not found');
  const values = [];
  const whereParts = buildFilters(input.filters, columns, values);
  const where = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';

  if (operation === 'select') {
    const selected = input.columns?.length ? input.columns : [...columns.keys()].slice(0, 25);
    if (selected.some((c) => !columns.has(c))) throw new Error('Invalid column');
    const distinct = input.distinct === true ? 'DISTINCT ' : '';
    const order = buildOrder(input.order_by, columns);
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 500);
    const rows = await sql.query(`SELECT ${distinct}${selected.map(qi).join(', ')} FROM ${qi(table)}${where}${order} LIMIT ${limit}`, values);
    return { table, operation, rowsReturned: rows.length, rows };
  }

  const groups = input.group_by || [];
  if (groups.some((c) => !columns.has(c))) throw new Error('Invalid group_by');
  const metrics = input.metrics || [{ op: 'count', as: 'count' }];
  const metricSql = metrics.map((m, i) => {
    if (!AGGS.has(m.op)) throw new Error('Invalid metric');
    if (m.op !== 'count' && !columns.has(m.column)) throw new Error('Invalid metric column');
    let expr;
    if (m.op === 'count') {
      expr = m.column ? `COUNT(NULLIF(${qi(m.column)}::text, ''))` : 'COUNT(*)';
    } else if (['sum', 'avg'].includes(m.op)) {
      expr = `${m.op.toUpperCase()}(NULLIF(regexp_replace(${qi(m.column)}::text, '[^0-9.-]', '', 'g'), '')::numeric)`;
    } else {
      expr = `${m.op.toUpperCase()}(${qi(m.column)})`;
    }
    return `${expr} AS ${qi(m.as || `${m.op}_${i + 1}`)}`;
  });
  const select = [...groups.map(qi), ...metricSql].join(', ');
  const group = groups.length ? ` GROUP BY ${groups.map(qi).join(', ')}` : '';
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  const rows = await sql.query(`SELECT ${select} FROM ${qi(table)}${where}${group} LIMIT ${limit}`, values);
  return { table, operation, rowsReturned: rows.length, rows };
}
