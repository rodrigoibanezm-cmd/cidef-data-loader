const AGE_EXPR = `(COALESCE($2::date, CURRENT_DATE) - vc.fecha_ingreso_stock::date)::int`;
const DEALER_LABEL = `COALESCE(NULLIF(d.nombre_comercial,''), d.razon_social_canonica, 'NO_RESUELTO')`;
const GROUP_LABEL = `COALESCE(dg.nombre_canonico, 'NO_RESUELTO')`;

function scopeSql() {
  return `
    vc.vigente IS TRUE
    AND vc.canal_salida = 'DEALER'
    AND ($3::bigint IS NULL OR vc.dealer_id = $3::bigint)
    AND ($4::bigint IS NULL OR vc.dealer_group_id = $4::bigint)
  `;
}

export function buildDealerAgingSummaryQuery(input) {
  return {
    params: [input.minDays, input.asOf, input.dealerId, input.dealerGroupId],
    query: `
      WITH scoped AS (
        SELECT vc.fecha_ingreso_stock, vc.dealer_id,
          CASE WHEN vc.fecha_ingreso_stock IS NULL THEN NULL ELSE ${AGE_EXPR} END AS aging_days
        FROM vehiculo_canonico vc
        WHERE ${scopeSql()}
      )
      SELECT
        COUNT(*)::int AS dealer_stock_current,
        COUNT(*) FILTER (WHERE fecha_ingreso_stock IS NOT NULL)::int AS with_fecha_ingreso,
        COUNT(*) FILTER (WHERE fecha_ingreso_stock IS NULL)::int AS missing_fecha_ingreso,
        COUNT(*) FILTER (WHERE aging_days > $1::integer)::int AS over_min_days,
        COUNT(*) FILTER (WHERE aging_days > $1::integer AND dealer_id IS NULL)::int AS aged_unresolved_dealer,
        MIN(aging_days) FILTER (WHERE aging_days > $1::integer)::int AS aging_min,
        MAX(aging_days) FILTER (WHERE aging_days > $1::integer)::int AS aging_max,
        ROUND(AVG(aging_days) FILTER (WHERE aging_days > $1::integer), 1) AS aging_avg
      FROM scoped
    `,
  };
}

export function buildDealerAgingByDealerQuery(input) {
  return {
    params: [input.minDays, input.asOf, input.dealerId, input.dealerGroupId],
    query: `
      SELECT vc.dealer_id, ${DEALER_LABEL} AS dealer,
        vc.dealer_group_id, ${GROUP_LABEL} AS dealer_group,
        COUNT(*)::int AS vins,
        MIN(${AGE_EXPR})::int AS aging_min,
        MAX(${AGE_EXPR})::int AS aging_max,
        ROUND(AVG(${AGE_EXPR}), 1) AS aging_promedio
      FROM vehiculo_canonico vc
      LEFT JOIN dealers_master d ON d.dealer_id = vc.dealer_id
      LEFT JOIN dealer_groups dg ON dg.dealer_group_id = vc.dealer_group_id
      WHERE ${scopeSql()}
        AND vc.fecha_ingreso_stock IS NOT NULL
        AND ${AGE_EXPR} > $1::integer
      GROUP BY vc.dealer_id, ${DEALER_LABEL}, vc.dealer_group_id, ${GROUP_LABEL}
      ORDER BY vins DESC, dealer ASC
    `,
  };
}

export function buildDealerAgingDetailQuery(input) {
  return {
    params: [input.minDays, input.asOf, input.dealerId, input.dealerGroupId, input.detailLimit],
    query: `
      SELECT vc.vin, vc.nro_stock, vc.marca_raw, vc.modelo_raw, vc.version_id,
        vc.bodega_fuente, vc.dealer_id, ${DEALER_LABEL} AS dealer,
        vc.dealer_group_id, ${GROUP_LABEL} AS dealer_group,
        vc.fecha_ingreso_stock::date AS fecha_ingreso_stock, ${AGE_EXPR} AS aging_days,
        vc.esta_reservado, vc.esta_en_transito, vc.en_patio,
        vc.nota_de_venta, vc.fecha_nv::date AS fecha_nv,
        vc.numero_factura, vc.fecha_factura::date AS fecha_factura,
        vc.pendiente_entrega
      FROM vehiculo_canonico vc
      LEFT JOIN dealers_master d ON d.dealer_id = vc.dealer_id
      LEFT JOIN dealer_groups dg ON dg.dealer_group_id = vc.dealer_group_id
      WHERE ${scopeSql()}
        AND vc.fecha_ingreso_stock IS NOT NULL
        AND ${AGE_EXPR} > $1::integer
      ORDER BY aging_days DESC, vc.vin ASC
      LIMIT $5::integer
    `,
  };
}
