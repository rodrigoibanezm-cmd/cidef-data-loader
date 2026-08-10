import { neon } from '@neondatabase/serverless';

const TABLES = new Set([
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

function normalizeTables(input) {
  const tables = Array.isArray(input.tables) ? input.tables : [input.table].filter(Boolean);
  if (!tables.length) throw new Error('table or tables is required');
  if (tables.some((t) => !TABLES.has(t))) throw new Error('Table not allowed');
  return [...new Set(tables)];
}

export async function run(input = {}) {
  const tables = normalizeTables(input);
  const sql = db();

  const rows = await sql.query(
    `SELECT table_name, column_name, data_type, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [tables],
  );

  const result = tables.map((table) => ({
    table,
    columns: rows
      .filter((r) => r.table_name === table)
      .map((r) => ({ name: r.column_name, type: r.data_type })),
  }));

  return { tables: result };
}
