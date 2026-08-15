import { neon } from '@neondatabase/serverless';

const TABLE = 'inventario_vehiculos_global_raw';
const MASTER = 'dealers_master';

export function buildDealerAgingQuery({ minDays = 60, dealer = null, asOf = null } = {}) {
  const params = [Number(minDays), dealer, asOf];
  const query = `
    WITH base AS (
      SELECT DISTINCT ON (vin_chasis)
        vin_chasis,
        TRIM(dealer_venta) AS dealer,
        TRIM(marca) AS marca,
        TRIM(desc_abrev) AS modelo,
        TO_TIMESTAMP(NULLIF(TRIM(fecha_ingreso_stk), ''), 'MM/DD/YY HH24:MI')::date AS fecha_ingreso_stk
      FROM ${TABLE}
      WHERE es_dealer IS TRUE
        AND vigente::text = '1'
        AND NULLIF(TRIM(dealer_venta), '') IS NOT NULL
        AND NULLIF(TRIM(fecha_ingreso_stk), '') IS NOT NULL
        AND ($2::text IS NULL OR TRIM(dealer_venta) = $2::text)
      ORDER BY vin_chasis, TO_TIMESTAMP(NULLIF(TRIM(fecha_ingreso_stk), ''), 'MM/DD/YY HH24:MI') DESC
    ), aged AS (
      SELECT *,
        (COALESCE($3::date, CURRENT_DATE) - fecha_ingreso_stk)::int AS aging_dias
      FROM base
    )
    SELECT
      d.dealer_id,
      a.dealer,
      COUNT(*)::int AS vins,
      MIN(a.aging_dias)::int AS aging_min,
      MAX(a.aging_dias)::int AS aging_max,
      ROUND(AVG(a.aging_dias), 1) AS aging_promedio
    FROM aged a
    LEFT JOIN ${MASTER} d
      ON d.activo IS TRUE
      AND d.tipo = 'DEALER'
      AND d.dealer = a.dealer
    WHERE a.aging_dias > $1::integer
    GROUP BY d.dealer_id, a.dealer
    ORDER BY vins DESC, a.dealer ASC
  `;
  return { query, params };
}

export async function run(input = {}) {
  const minDays = input.min_days == null ? 60 : Number(input.min_days);
  if (!Number.isInteger(minDays) || minDays < 0) throw new Error('min_days must be a non-negative integer');
  const dealer = input.dealer == null ? null : String(input.dealer).trim();
  const asOf = input.as_of == null ? null : String(input.as_of);
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const { query, params } = buildDealerAgingQuery({ minDays, dealer: dealer || null, asOf });
  const rows = await sql.query(query, params);
  return {
    table: TABLE,
    dealer_master: MASTER,
    metric: 'dealer_inventory_aging',
    aging_from: 'fecha_ingreso_stk',
    filters: { es_dealer: true, vigente: '1', min_days_exclusive: minDays, dealer: dealer || null },
    as_of: asOf || 'CURRENT_DATE',
    grain: 'distinct_vin_grouped_by_dealer',
    rowsReturned: rows.length,
    rows,
  };
}
