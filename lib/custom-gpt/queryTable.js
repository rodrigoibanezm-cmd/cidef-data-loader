import { assertTable } from './catalog.js';
import { columnsFor, customGptDb, qi } from './db.js';
import { buildFilters } from './filters.js';

const AGGS = new Set(['count', 'sum', 'avg', 'min', 'max']);
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const MAX_GROUP_BY = 4;

function metricSql(metric, index, known) {
  if (!AGGS.has(metric.op)) throw new Error('Invalid metric');
  if (metric.op !== 'count' && !known.has(metric.column)) throw new Error('Invalid metric column');
  if (metric.op === 'count' && metric.column && !known.has(metric.column)) throw new Error('Invalid metric column');
  const alias = qi(metric.as || `${metric.op}_${index + 1}`);
  if (metric.op === 'count') return `${metric.column ? `COUNT(${qi(metric.column)})` : 'COUNT(*)'} AS ${alias}`;
  if (['sum', 'avg'].includes(metric.op)) {
    return `${metric.op.toUpperCase()}(NULLIF(regexp_replace(${qi(metric.column)}::text, '[^0-9.-]', '', 'g'), '')::numeric) AS ${alias}`;
  }
  return `${metric.op.toUpperCase()}(${qi(metric.column)}) AS ${alias}`;
}

export async function queryTable(input) {
  const table = assertTable(input.table);
  const operation = input.operation || 'select';
  if (!['select', 'aggregate'].includes(operation)) throw new Error('Invalid operation');

  const sql = customGptDb();
  const columns = await columnsFor(sql, table);
  const known = new Set(columns.map((column) => column.column_name));
  const values = [];
  const filters = buildFilters(input.filters, columns, values);
  const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(input.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  if (operation === 'select') {
    const selected = Array.isArray(input.columns) && input.columns.length
      ? input.columns
      : columns.slice(0, 20).map((column) => column.column_name);
    if (selected.some((column) => !known.has(column))) throw new Error('Invalid column');
    const rows = await sql.query(
      `SELECT ${selected.map(qi).join(', ')} FROM ${qi(table)}${where} LIMIT ${limit}`,
      values,
    );
    return { table, operation, rowsReturned: rows.length, rows };
  }

  const groups = Array.isArray(input.group_by) ? input.group_by : [];
  if (groups.length > MAX_GROUP_BY || groups.some((column) => !known.has(column))) {
    throw new Error('Invalid group_by');
  }
  const metrics = Array.isArray(input.metrics) && input.metrics.length
    ? input.metrics
    : [{ op: 'count', as: 'count' }];
  const select = [...groups.map(qi), ...metrics.map((metric, i) => metricSql(metric, i, known))].join(', ');
  const groupBy = groups.length ? ` GROUP BY ${groups.map(qi).join(', ')}` : '';
  const rows = await sql.query(
    `SELECT ${select} FROM ${qi(table)}${where}${groupBy} LIMIT ${limit}`,
    values,
  );
  return { table, operation, rowsReturned: rows.length, rows };
}
