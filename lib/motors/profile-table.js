import { neon } from '@neondatabase/serverless';
import { assertAnalyticTable } from './allowed-tables.js';

const LOW_CARDINALITY_LIMIT = 100;
const DEFAULT_TOP_LIMIT = 10;
const MAX_TOP_LIMIT = 20;
const DEFAULT_SAMPLE_LIMIT = 5;
const MAX_SAMPLE_LIMIT = 10;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

const qi = (value) => `"${String(value).replace(/"/g, '""')}"`;

export async function run(input = {}) {
  const table = input.table;
  assertAnalyticTable(table);
  const sql = db();

  const [{ count }] = await sql.query(`SELECT COUNT(*)::bigint AS count FROM ${qi(table)}`);
  const allColumns = await sql.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table],
  );
  if (!allColumns.length) throw new Error('Table not found');

  const requested = Array.isArray(input.columns) && input.columns.length ? new Set(input.columns) : null;
  if (requested) {
    const known = new Set(allColumns.map((c) => c.column_name));
    if ([...requested].some((c) => !known.has(c))) throw new Error('Invalid column');
  }

  const columns = requested ? allColumns.filter((c) => requested.has(c.column_name)) : allColumns;
  const topLimit = Math.min(Math.max(Number(input.top_limit) || DEFAULT_TOP_LIMIT, 1), MAX_TOP_LIMIT);
  const sampleLimit = Math.min(Math.max(Number(input.sample_limit) || DEFAULT_SAMPLE_LIMIT, 1), MAX_SAMPLE_LIMIT);
  const profile = [];

  for (const { column_name, data_type } of columns) {
    const col = qi(column_name);
    const textExpr = `${col}::text`;
    const [stats] = await sql.query(
      `SELECT
         COUNT(*) FILTER (WHERE ${col} IS NULL OR ${textExpr}='')::bigint AS nulls,
         COUNT(DISTINCT NULLIF(${textExpr}, ''))::bigint AS distinct_count,
         MIN(NULLIF(${textExpr}, '')) AS min_value,
         MAX(NULLIF(${textExpr}, '')) AS max_value
       FROM ${qi(table)}`,
    );

    const distinct = Number(stats.distinct_count);
    const topValues = await sql.query(
      `SELECT ${textExpr} AS value, COUNT(*)::bigint AS count
       FROM ${qi(table)}
       WHERE ${col} IS NOT NULL AND ${textExpr} <> ''
       GROUP BY ${textExpr}
       ORDER BY COUNT(*) DESC, ${textExpr}
       LIMIT ${topLimit}`,
    );

    const samples = await sql.query(
      `SELECT DISTINCT ${textExpr} AS value
       FROM ${qi(table)}
       WHERE ${col} IS NOT NULL AND ${textExpr} <> ''
       LIMIT ${sampleLimit}`,
    );

    let values = null;
    if (distinct <= LOW_CARDINALITY_LIMIT) {
      values = await sql.query(
        `SELECT ${textExpr} AS value, COUNT(*)::bigint AS count
         FROM ${qi(table)}
         WHERE ${col} IS NOT NULL AND ${textExpr} <> ''
         GROUP BY ${textExpr}
         ORDER BY ${textExpr}`,
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
    columnsProfiled: profile.length,
    totalColumns: allColumns.length,
    lowCardinalityLimit: LOW_CARDINALITY_LIMIT,
    profile,
  };
}
