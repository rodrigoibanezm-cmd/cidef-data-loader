import { neon } from '@neondatabase/serverless';
import { ventasMonthlyDedupSensitivityV01 } from './motors/ventas-monthly-dedup-sensitivity-v01.js';

const RAW_TABLES = Object.freeze([
  'vehiculos_raw',
  'ventas_raw',
  'notas_venta_raw',
  'rvm_raw',
]);

const MASTER_TABLES = Object.freeze([
  'marcas_master_v01',
  'modelos_master_v01',
  'versiones_master_v01',
  'producto_aliases_v01',
  'producto_clasificacion_v01',
  'producto_portafolio_v01',
  'sucursales_master',
  'sucursal_aliases',
  'dealer_groups',
  'dealers_master',
  'dealer_aliases',
  'dealer_supervisor',
  'personas_master',
  'persona_aliases',
  'persona_roles',
  'persona_sucursal',
  'persona_estado_comercial',
  'master_conflicts',
]);

export const CUSTOM_GPT_TABLES = Object.freeze([...RAW_TABLES, ...MASTER_TABLES]);
const ALLOWED = new Set(CUSTOM_GPT_TABLES);
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'is_null', 'not_null']);
const AGGS = new Set(['count', 'sum', 'avg', 'min', 'max']);
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const MAX_GROUP_BY = 4;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

const qi = (value) => `"${String(value).replace(/"/g, '""')}"`;

function assertTable(table) {
  if (!ALLOWED.has(table)) throw new Error('Table not allowed');
  return table;
}

async function columnsFor(sql, table) {
  const rows = await sql.query(
    `SELECT column_name, data_type, ordinal_position
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table],
  );
  if (!rows.length) throw new Error(`Table not found: ${table}`);
  return rows;
}

function typedComparison(column, dataType, operator, placeholder) {
  const numeric = new Set(['smallint', 'integer', 'bigint', 'decimal', 'numeric', 'real', 'double precision']);
  const dates = new Set(['date', 'timestamp without time zone', 'timestamp with time zone']);
  if (numeric.has(dataType)) return `${qi(column)}::numeric ${operator} ${placeholder}::numeric`;
  if (dates.has(dataType)) return `${qi(column)}::timestamp ${operator} ${placeholder}::timestamp`;
  if (dataType === 'boolean') return `${qi(column)}::boolean ${operator} ${placeholder}::boolean`;
  return `${qi(column)}::text ${operator} ${placeholder}`;
}

function buildFilters(filters, columns, values) {
  const byName = new Map(columns.map((c) => [c.column_name, c.data_type]));
  return (filters || []).map((f) => {
    if (!byName.has(f.column) || !OPS.has(f.op)) throw new Error('Invalid filter');
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
    const operator = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[f.op];
    return typedComparison(f.column, byName.get(f.column), operator, `$${values.length}`);
  });
}

async function listTables() {
  return {
    raw: RAW_TABLES,
    master: MASTER_TABLES,
    all: CUSTOM_GPT_TABLES,
  };
}

async function tableSchema(input) {
  const requested = Array.isArray(input.tables) ? input.tables : [input.table].filter(Boolean);
  if (!requested.length) throw new Error('table or tables is required');
  requested.forEach(assertTable);
  const sql = db();
  const tables = [];
  for (const table of [...new Set(requested)]) {
    const columns = await columnsFor(sql, table);
    tables.push({
      table,
      columns: columns.map((c) => ({ name: c.column_name, type: c.data_type })),
    });
  }
  return { tables };
}

async function queryTable(input) {
  const table = assertTable(input.table);
  const operation = input.operation || 'select';
  if (!['select', 'aggregate'].includes(operation)) throw new Error('Invalid operation');
  const sql = db();
  const columns = await columnsFor(sql, table);
  const known = new Set(columns.map((c) => c.column_name));
  const values = [];
  const filters = buildFilters(input.filters, columns, values);
  const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(input.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  if (operation === 'select') {
    const selected = Array.isArray(input.columns) && input.columns.length
      ? input.columns
      : columns.slice(0, 20).map((c) => c.column_name);
    if (selected.some((c) => !known.has(c))) throw new Error('Invalid column');
    const rows = await sql.query(
      `SELECT ${selected.map(qi).join(', ')} FROM ${qi(table)}${where} LIMIT ${limit}`,
      values,
    );
    return { table, operation, rowsReturned: rows.length, rows };
  }

  const groups = Array.isArray(input.group_by) ? input.group_by : [];
  if (groups.length > MAX_GROUP_BY || groups.some((c) => !known.has(c))) throw new Error('Invalid group_by');
  const metrics = Array.isArray(input.metrics) && input.metrics.length
    ? input.metrics
    : [{ op: 'count', as: 'count' }];
  const metricSql = metrics.map((m, i) => {
    if (!AGGS.has(m.op)) throw new Error('Invalid metric');
    if (m.op !== 'count' && !known.has(m.column)) throw new Error('Invalid metric column');
    if (m.op === 'count' && m.column && !known.has(m.column)) throw new Error('Invalid metric column');
    const alias = qi(m.as || `${m.op}_${i + 1}`);
    if (m.op === 'count') return `${m.column ? `COUNT(${qi(m.column)})` : 'COUNT(*)'} AS ${alias}`;
    if (['sum', 'avg'].includes(m.op)) {
      return `${m.op.toUpperCase()}(NULLIF(regexp_replace(${qi(m.column)}::text, '[^0-9.-]', '', 'g'), '')::numeric) AS ${alias}`;
    }
    return `${m.op.toUpperCase()}(${qi(m.column)}) AS ${alias}`;
  });
  const select = [...groups.map(qi), ...metricSql].join(', ');
  const groupBy = groups.length ? ` GROUP BY ${groups.map(qi).join(', ')}` : '';
  const rows = await sql.query(
    `SELECT ${select} FROM ${qi(table)}${where}${groupBy} LIMIT ${limit}`,
    values,
  );
  return { table, operation, rowsReturned: rows.length, rows };
}

async function profileTable(input) {
  const table = assertTable(input.table);
  const sql = db();
  const columns = await columnsFor(sql, table);
  const requested = Array.isArray(input.columns) && input.columns.length
    ? input.columns
    : columns.slice(0, 12).map((c) => c.column_name);
  const known = new Set(columns.map((c) => c.column_name));
  if (requested.some((c) => !known.has(c))) throw new Error('Invalid column');
  const [{ count }] = await sql.query(`SELECT COUNT(*)::bigint AS count FROM ${qi(table)}`);
  const profile = [];
  for (const column of requested) {
    const col = qi(column);
    const [stats] = await sql.query(
      `SELECT COUNT(*) FILTER (WHERE ${col} IS NULL OR ${col}::text='')::bigint AS nulls,
              COUNT(DISTINCT NULLIF(${col}::text,''))::bigint AS distinct_count,
              MIN(NULLIF(${col}::text,'')) AS min_value,
              MAX(NULLIF(${col}::text,'')) AS max_value
       FROM ${qi(table)}`,
    );
    const topValues = await sql.query(
      `SELECT ${col}::text AS value, COUNT(*)::bigint AS count
       FROM ${qi(table)}
       WHERE ${col} IS NOT NULL AND ${col}::text <> ''
       GROUP BY ${col}::text
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
    );
    profile.push({
      column,
      nulls: Number(stats.nulls),
      distinct: Number(stats.distinct_count),
      min: stats.min_value,
      max: stats.max_value,
      topValues: topValues.map((r) => ({ value: r.value, count: Number(r.count) })),
    });
  }
  return { table, rows: Number(count), profile };
}

const ACTIONS = Object.freeze({
  list_tables: listTables,
  table_schema: tableSchema,
  query_table: queryTable,
  profile_table: profileTable,
  ventas_monthly_dedup_sensitivity_v01: ventasMonthlyDedupSensitivityV01,
});

export function listCustomGptActions() {
  return Object.keys(ACTIONS);
}

export async function runCustomGptAction(action, input = {}) {
  const run = ACTIONS[action];
  if (!run) throw new Error('Unknown Custom GPT action');
  return run(input);
}
