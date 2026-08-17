import { neon } from '@neondatabase/serverless';
import { assertAnalyticTable } from './allowed-tables.js';

const JOIN_TYPES = new Set(['inner', 'left']);
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null']);
const AGGS = new Set(['count', 'sum', 'avg', 'min', 'max']);
const DEFAULT_LIMIT = 300;
const FORCED_MAX_LIMIT = 2000;
const MAX_GROUP_BY = 3;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

const qi = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function getColumns(sql, table) {
  const rows = await sql.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table],
  );
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

function resolveLimit(input) {
  const requested = Number(input.limit) || DEFAULT_LIMIT;
  if (requested <= DEFAULT_LIMIT) return Math.max(requested, 1);
  if (input.force_limit !== true) throw new Error(`limit above ${DEFAULT_LIMIT} requires force_limit=true`);
  return Math.min(Math.max(requested, 1), FORCED_MAX_LIMIT);
}

function buildFilters(filters, columns, alias, values) {
  return (filters || []).map((f) => {
    if (!columns.has(f.column) || !OPS.has(f.op)) throw new Error('Invalid filter');
    const col = `${alias}.${qi(f.column)}`;

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

function sideInfo(side, leftCols, rightCols) {
  if (side === 'left') return { alias: 'l', columns: leftCols, prefix: 'left' };
  if (side === 'right') return { alias: 'r', columns: rightCols, prefix: 'right' };
  throw new Error('Invalid side');
}

function buildOrder(orderBy, allowedNames) {
  const items = Array.isArray(orderBy) ? orderBy : [];
  if (!items.length) return '';
  return ` ORDER BY ${items.map((o) => {
    if (!allowedNames.has(o.column)) throw new Error('Invalid order column');
    const direction = String(o.direction || 'asc').toLowerCase();
    if (!['asc', 'desc'].includes(direction)) throw new Error('Invalid order direction');
    return `${qi(o.column)} ${direction.toUpperCase()} NULLS LAST`;
  }).join(', ')}`;
}

export async function run(input = {}) {
  const {
    left_table,
    right_table,
    left_key,
    right_key,
    join_type = 'inner',
    operation = 'select',
  } = input;

  assertAnalyticTable(left_table);
  assertAnalyticTable(right_table);
  if (!JOIN_TYPES.has(join_type)) throw new Error('Invalid join_type');
  if (!['select', 'aggregate'].includes(operation)) throw new Error('Invalid operation');
  if (!left_key || !right_key) throw new Error('left_key and right_key are required');

  const sql = db();
  const leftCols = await getColumns(sql, left_table);
  const rightCols = await getColumns(sql, right_table);
  if (!leftCols.has(left_key) || !rightCols.has(right_key)) throw new Error('Join key missing from table');

  const normalize = input.normalize_keys === true;
  const leftExpr = normalize ? `upper(trim(l.${qi(left_key)}::text))` : `l.${qi(left_key)}`;
  const rightExpr = normalize ? `upper(trim(r.${qi(right_key)}::text))` : `r.${qi(right_key)}`;
  const joinSql = `${qi(left_table)} l ${join_type.toUpperCase()} JOIN ${qi(right_table)} r ON ${leftExpr} = ${rightExpr}`;

  const values = [];
  const filters = [
    ...buildFilters(input.left_filters, leftCols, 'l', values),
    ...buildFilters(input.right_filters, rightCols, 'r', values),
  ];
  const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
  const limit = resolveLimit(input);
  const offset = Math.max(Number(input.offset) || 0, 0);

  if (operation === 'select') {
    const leftSelect = input.left_columns?.length ? input.left_columns : [left_key];
    const rightSelect = input.right_columns?.length ? input.right_columns : [right_key];
    if (leftSelect.some((c) => !leftCols.has(c))) throw new Error('Invalid left column');
    if (rightSelect.some((c) => !rightCols.has(c))) throw new Error('Invalid right column');

    const selections = [
      ...leftSelect.map((c) => `l.${qi(c)} AS ${qi(`left_${c}`)}`),
      ...rightSelect.map((c) => `r.${qi(c)} AS ${qi(`right_${c}`)}`),
    ];
    const allowedOrder = new Set([
      ...leftSelect.map((c) => `left_${c}`),
      ...rightSelect.map((c) => `right_${c}`),
    ]);
    const order = buildOrder(input.order_by, allowedOrder);

    const rows = await sql.query(
      `SELECT ${selections.join(', ')} FROM ${joinSql}${where}${order} LIMIT ${limit} OFFSET ${offset}`,
      values,
    );

    return {
      left_table,
      right_table,
      left_key,
      right_key,
      join_type,
      normalize_keys: normalize,
      operation,
      rowsReturned: rows.length,
      limit,
      offset,
      rows,
    };
  }

  const groups = Array.isArray(input.group_by) ? input.group_by : [];
  if (groups.length > MAX_GROUP_BY) throw new Error(`group_by supports at most ${MAX_GROUP_BY} columns`);

  const groupSql = groups.map((g, i) => {
    const info = sideInfo(g.side, leftCols, rightCols);
    if (!info.columns.has(g.column)) throw new Error('Invalid group_by column');
    const as = g.as || `${info.prefix}_${g.column}`;
    return { expression: `${info.alias}.${qi(g.column)}`, as };
  });

  const metrics = input.metrics?.length ? input.metrics : [{ op: 'count', as: 'count' }];
  const metricSql = metrics.map((m, i) => {
    if (!AGGS.has(m.op)) throw new Error('Invalid metric');
    const as = m.as || `${m.op}_${i + 1}`;

    if (m.op === 'count' && !m.column) return { expression: 'COUNT(*)', as };

    const info = sideInfo(m.side, leftCols, rightCols);
    if (!info.columns.has(m.column)) throw new Error('Invalid metric column');
    const col = `${info.alias}.${qi(m.column)}`;

    let expression;
    if (m.op === 'count') expression = `COUNT(NULLIF(${col}::text, ''))`;
    else if (['sum', 'avg'].includes(m.op)) expression = `${m.op.toUpperCase()}(NULLIF(regexp_replace(${col}::text, '[^0-9.-]', '', 'g'), '')::numeric)`;
    else expression = `${m.op.toUpperCase()}(${col})`;

    return { expression, as };
  });

  const select = [
    ...groupSql.map((g) => `${g.expression} AS ${qi(g.as)}`),
    ...metricSql.map((m) => `${m.expression} AS ${qi(m.as)}`),
  ].join(', ');
  const group = groupSql.length ? ` GROUP BY ${groupSql.map((g) => g.expression).join(', ')}` : '';
  const allowedOrder = new Set([...groupSql.map((g) => g.as), ...metricSql.map((m) => m.as)]);
  const order = buildOrder(input.order_by, allowedOrder);

  const rows = await sql.query(
    `SELECT ${select} FROM ${joinSql}${where}${group}${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  );

  return {
    left_table,
    right_table,
    left_key,
    right_key,
    join_type,
    normalize_keys: normalize,
    operation,
    rowsReturned: rows.length,
    limit,
    offset,
    rows,
  };
}
