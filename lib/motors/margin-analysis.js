import { neon } from '@neondatabase/serverless';

const TABLES = new Set(['estadisticas_venta_raw']);
function ident(v) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error('Invalid identifier');
  return `"${v}"`;
}

export async function run(input = {}) {
  const table = String(input.table || 'estadisticas_venta_raw');
  const revenueColumn = String(input.revenue_column || 'precio_vta');
  const costColumn = String(input.cost_column || 'precio_costo');
  const groupBy = input.group_by ? String(input.group_by) : null;
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  if (!TABLES.has(table)) throw new Error('Invalid table');

  const t = ident(table), r = ident(revenueColumn), c = ident(costColumn);
  const g = groupBy ? ident(groupBy) : null;
  const rev = `NULLIF(TRIM(${r}::text), '')::numeric`;
  const cost = `NULLIF(TRIM(${c}::text), '')::numeric`;
  const groupSelect = g ? `${g} AS group_value,` : `NULL::text AS group_value,`;
  const groupSql = g ? `GROUP BY ${g}` : '';
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  const rows = await sql.query(`
    SELECT ${groupSelect}
      COUNT(*)::int AS n,
      AVG(${rev}) AS avg_revenue,
      AVG(${cost}) AS avg_cost,
      AVG(${rev} - ${cost}) AS avg_gross_margin,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (${rev} - ${cost})) AS median_gross_margin,
      SUM(${rev} - ${cost}) AS total_gross_margin,
      AVG(CASE WHEN ${rev} <> 0 THEN ((${rev} - ${cost}) / ${rev}) * 100 END) AS avg_gross_margin_pct
    FROM ${t}
    WHERE NULLIF(TRIM(${r}::text), '') IS NOT NULL
      AND NULLIF(TRIM(${c}::text), '') IS NOT NULL
    ${groupSql}
    ORDER BY n DESC
    LIMIT ${limit}
  `);

  return {
    table, revenue_column: revenueColumn, cost_column: costColumn,
    group_by: groupBy, margin_type: 'gross_before_bonuses',
    rowsReturned: rows.length, rows
  };
}
