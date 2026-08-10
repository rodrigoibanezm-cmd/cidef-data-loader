import { neon } from '@neondatabase/serverless';

const TABLES = new Set([
  'inventario_vehiculos_global_raw',
  'notas_venta_raw',
  'estadisticas_venta_raw',
  'lista_precios_raw',
]);

const JOIN_KEYS = new Set(['nro_vin_chasis', 'chasis', 'nro_unidad']);
const JOIN_TYPES = new Set(['inner', 'left']);

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

function aliasColumns(tableAlias, cols, prefix) {
  return cols.map((c) => `${tableAlias}.${qi(c)} AS ${qi(`${prefix}_${c}`)}`);
}

export async function run(input = {}) {
  const { left_table, right_table, left_key, right_key, join_type = 'inner' } = input;

  if (!TABLES.has(left_table) || !TABLES.has(right_table)) throw new Error('Table not allowed');
  if (!JOIN_TYPES.has(join_type)) throw new Error('Invalid join_type');
  if (!JOIN_KEYS.has(left_key) || !JOIN_KEYS.has(right_key)) throw new Error('Join key not allowed');

  const sql = db();
  const leftCols = await getColumns(sql, left_table);
  const rightCols = await getColumns(sql, right_table);

  if (!leftCols.has(left_key) || !rightCols.has(right_key)) throw new Error('Join key missing from table');

  const leftSelect = input.left_columns?.length ? input.left_columns : [left_key];
  const rightSelect = input.right_columns?.length ? input.right_columns : [right_key];

  if (leftSelect.some((c) => !leftCols.has(c))) throw new Error('Invalid left column');
  if (rightSelect.some((c) => !rightCols.has(c))) throw new Error('Invalid right column');

  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  const selectSql = [
    ...aliasColumns('l', leftSelect, 'left'),
    ...aliasColumns('r', rightSelect, 'right'),
  ].join(', ');

  const query = `SELECT ${selectSql} FROM ${qi(left_table)} l ${join_type.toUpperCase()} JOIN ${qi(right_table)} r ON l.${qi(left_key)} = r.${qi(right_key)} LIMIT ${limit}`;
  const rows = await sql.query(query);

  return {
    left_table,
    right_table,
    left_key,
    right_key,
    join_type,
    rowsReturned: rows.length,
    rows,
  };
}
