import { neon } from '@neondatabase/serverless';

const ALLOWED_TABLES = new Set([
  'inventario_vehiculos_global_raw',
  'notas_venta_raw',
  'estadisticas_venta_raw',
  'lista_precios_raw',
]);

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function assertTable(table) {
  if (!ALLOWED_TABLES.has(table)) throw new Error('Table not allowed');
}

export async function run(input = {}) {
  const table = input.table;
  assertTable(table);
  const sql = db();

  const [{ count }] = await sql.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
  const columns = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );

  const profile = [];
  for (const { column_name } of columns) {
    const q = `SELECT COUNT(*) FILTER (WHERE "${column_name}" IS NULL OR "${column_name}"='')::bigint AS nulls, COUNT(DISTINCT "${column_name}")::bigint AS distinct_count FROM "${table}"`;
    const [r] = await sql.query(q);
    profile.push({ column: column_name, nulls: Number(r.nulls), distinct: Number(r.distinct_count) });
  }

  return { table, rows: Number(count), columns: profile.length, profile };
}
