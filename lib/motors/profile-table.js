import { neon } from '@neondatabase/serverless';

const ALLOWED_TABLES = new Set([
  'inventario_vehiculos_global_raw',
  'notas_venta_raw',
  'estadisticas_venta_raw',
  'lista_precios_raw',
  'rvm_raw',
]);

const LOW_CARDINALITY_LIMIT = 100;
const TOP_LIMIT = 20;
const SAMPLE_LIMIT = 10;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function assertTable(table) {
  if (!ALLOWED_TABLES.has(table)) throw new Error('Table not allowed');
}

const qi = (value) => `"${String(value).replace(/"/g, '""')}"`;

export async function run(input = {}) {
  const table = input.table;
  assertTable(table);
  const sql = db();

  const [{ count }] = await sql.query(`SELECT COUNT(*)::bigint AS count FROM ${qi(table)}`);
  const columns = await sql.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table],
  );

  const profile = [];

  for (const { column_name, data_type } of columns) {
    const col = qi(column_name);
    const [stats] = await sql.query(
      `SELECT
         COUNT(*) FILTER (WHERE ${col} IS NULL OR ${col}='')::bigint AS nulls,
         COUNT(DISTINCT NULLIF(${col}, ''))::bigint AS distinct_count,
         MIN(NULLIF(${col}, '')) AS min_value,
         MAX(NULLIF(${col}, '')) AS max_value
       FROM ${qi(table)}`,
    );

    const distinct = Number(stats.distinct_count);

    const topValues = await sql.query(
      `SELECT ${col} AS value, COUNT(*)::bigint AS count
       FROM ${qi(table)}
       WHERE ${col} IS NOT NULL AND ${col} <> ''
       GROUP BY ${col}
       ORDER BY COUNT(*) DESC, ${col}
       LIMIT ${TOP_LIMIT}`,
    );

    const samples = await sql.query(
      `SELECT DISTINCT ${col} AS value
       FROM ${qi(table)}
       WHERE ${col} IS NOT NULL AND ${col} <> ''
       LIMIT ${SAMPLE_LIMIT}`,
    );

    let values = null;
    if (distinct <= LOW_CARDINALITY_LIMIT) {
      values = await sql.query(
        `SELECT ${col} AS value, COUNT(*)::bigint AS count
         FROM ${qi(table)}
         WHERE ${col} IS NOT NULL AND ${col} <> ''
         GROUP BY ${col}
         ORDER BY ${col}`,
      );
    }

    profile.push({
      column: column_name,
      dataType: data_type,
      nulls: Number(stats.nulls),
      distinct,
      min: stats.min_value,
      max: stats.max_value,
      topValues: topValues.map((r) => ({ value: r.value, count: Number(r.count) })),
      samples: samples.map((r) => r.value),
      values: values?.map((r) => ({ value: r.value, count: Number(r.count) })) ?? null,
    });
  }

  return {
    table,
    rows: Number(count),
    columns: profile.length,
    lowCardinalityLimit: LOW_CARDINALITY_LIMIT,
    profile,
  };
}
