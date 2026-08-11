import { neon } from '@neondatabase/serverless';

const TABLE = 'inventario_vehiculos_global_raw';

function ident(v) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v)) throw new Error('Invalid identifier');
  return `"${v}"`;
}

export async function run(input = {}) {
  const dateColumn = String(input.date_column || 'fecha_ingreso_stk');
  const activeColumn = String(input.active_column || 'vigente');
  const activeValue = String(input.active_value ?? '1');
  const asOf = input.as_of ? String(input.as_of) : null;

  const d = ident(dateColumn);
  const a = ident(activeColumn);
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const asOfExpr = asOf ? `$1::date` : 'CURRENT_DATE';
  const params = asOf ? [asOf, activeValue] : [activeValue];
  const activeParam = asOf ? '$2' : '$1';

  const rows = await sql.query(`
    WITH base AS (
      SELECT DISTINCT ON (vin_chasis)
        vin_chasis, marca, modelo, bodega, empresa,
        TO_TIMESTAMP(${d}, 'MM/DD/YY HH24:MI')::date AS ingreso,
        (${asOfExpr} - TO_TIMESTAMP(${d}, 'MM/DD/YY HH24:MI')::date) AS age_days
      FROM ${TABLE}
      WHERE ${a}::text = ${activeParam}
        AND vin_chasis IS NOT NULL
        AND NULLIF(TRIM(${d}::text), '') IS NOT NULL
      ORDER BY vin_chasis, TO_TIMESTAMP(${d}, 'MM/DD/YY HH24:MI') DESC
    ), bucketed AS (
      SELECT
        CASE
          WHEN age_days <= 30 THEN '0-30'
          WHEN age_days <= 60 THEN '31-60'
          WHEN age_days <= 90 THEN '61-90'
          WHEN age_days <= 120 THEN '91-120'
          ELSE '121+'
        END AS bucket,
        age_days
      FROM base
    ), summary AS (
      SELECT bucket,
        COUNT(*)::int AS n,
        MIN(age_days)::int AS min_days,
        MAX(age_days)::int AS max_days,
        ROUND(AVG(age_days), 1) AS avg_days
      FROM bucketed
      GROUP BY bucket
    )
    SELECT * FROM summary
    ORDER BY CASE bucket
      WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3
      WHEN '91-120' THEN 4 ELSE 5 END
  `, params);

  return {
    table: TABLE,
    date_column: dateColumn,
    active_filter: { column: activeColumn, value: activeValue },
    as_of: asOf || 'CURRENT_DATE',
    grain: 'distinct_vin',
    rowsReturned: rows.length,
    rows,
  };
}
