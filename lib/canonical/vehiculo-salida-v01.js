import { queryDb } from '../neon.js';

const FORUM_BUYER_SQL = `
  translate(master_norm(cs.razon_social), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = 'FORUM DISTRIBUIDORA S.A.'
`;

const BASE_CTE = `
WITH current_sale AS (
  SELECT DISTINCT
    vc.vin,
    vc.numero_factura,
    vc.factura_tipo,
    vc.nota_de_venta,
    v.nro_operacion,
    v.razon_social,
    v.entidad_financiera,
    v.id_sucursal_vta,
    v.desc_sucursal_vta
  FROM vehiculo_canonico vc
  JOIN ventas_raw v
    ON upper(btrim(v.nro_vin_chasis)) = vc.vin
   AND vc.numero_factura IS NOT NULL
   AND master_norm(v.nro_factura) = master_norm(vc.numero_factura)
),
current_notes AS (
  SELECT DISTINCT
    cs.vin,
    cs.nro_operacion,
    n.comentario
  FROM current_sale cs
  JOIN notas_venta_raw n
    ON upper(btrim(n.chasis)) = cs.vin
   AND (
     (cs.nro_operacion IS NOT NULL AND master_norm(n.nro_operacion) = master_norm(cs.nro_operacion))
     OR (
       cs.nota_de_venta IS NOT NULL
       AND master_norm(n.nota_de_venta) = master_norm(cs.nota_de_venta)
     )
   )
  WHERE n.comentario IS NOT NULL
    AND btrim(n.comentario) <> ''
),
direct_candidates AS (
  SELECT cs.vin, da.dealer_id
  FROM current_sale cs
  JOIN dealer_aliases da
    ON da.validated
   AND da.valor_normalizado = master_norm(cs.razon_social)
  GROUP BY cs.vin, da.dealer_id
),
direct_resolved AS (
  SELECT
    vin,
    CASE WHEN count(DISTINCT dealer_id) = 1 THEN min(dealer_id) END AS dealer_id,
    count(DISTINCT dealer_id) AS dealer_count
  FROM direct_candidates
  GROUP BY vin
),
comment_candidates AS (
  SELECT DISTINCT cn.vin, d.dealer_id, d.dealer_group_id
  FROM current_notes cn
  JOIN dealers_master d
    ON (
      regexp_replace(upper(cn.comentario), '[^0-9A-ZÁÉÍÓÚÜÑ]', '', 'g') LIKE '%' || d.rut_normalizado || '%'
      OR regexp_replace(master_norm(cn.comentario), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') LIKE '%' || regexp_replace(master_norm(d.razon_social_canonica), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') || '%'
      OR (
        d.nombre_comercial IS NOT NULL
        AND length(master_norm(d.nombre_comercial)) >= 4
        AND regexp_replace(master_norm(cn.comentario), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') LIKE '%' || regexp_replace(master_norm(d.nombre_comercial), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') || '%'
      )
    )
  UNION
  SELECT DISTINCT cn.vin, da.dealer_id, d.dealer_group_id
  FROM current_notes cn
  JOIN dealer_aliases da
    ON da.validated
   AND length(da.valor_normalizado) >= 4
   AND regexp_replace(master_norm(cn.comentario), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') LIKE '%' || regexp_replace(da.valor_normalizado, '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') || '%'
  JOIN dealers_master d ON d.dealer_id = da.dealer_id
),
comment_resolved AS (
  SELECT
    vin,
    CASE WHEN count(DISTINCT dealer_id) = 1 THEN min(dealer_id) END AS dealer_id,
    CASE WHEN count(DISTINCT dealer_group_id) = 1 THEN min(dealer_group_id) END AS dealer_group_id,
    count(DISTINCT dealer_id) AS dealer_count,
    count(DISTINCT dealer_group_id) AS dealer_group_count
  FROM comment_candidates
  GROUP BY vin
),
sale_context AS (
  SELECT
    cs.vin,
    bool_or(${FORUM_BUYER_SQL}) AS forum_buyer,
    bool_or(translate(master_norm(cs.entidad_financiera), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = 'FORUM') AS forum_financed,
    CASE WHEN count(DISTINCT sm.sucursal_id) = 1 THEN min(sm.sucursal_id) END AS sucursal_id,
    CASE WHEN count(DISTINCT sm.tipo_canal) = 1 THEN min(sm.tipo_canal) END AS tipo_canal_sucursal
  FROM current_sale cs
  LEFT JOIN sucursales_master sm
    ON sm.id_sucursal_vta IS NOT NULL
   AND btrim(sm.id_sucursal_vta) = btrim(cs.id_sucursal_vta)
  GROUP BY cs.vin
),
resolution AS (
  SELECT
    vc.vin,
    (vc.numero_factura IS NOT NULL AND vc.fecha_factura IS NOT NULL) AS vendido,
    sc.sucursal_id,
    sc.tipo_canal_sucursal,
    sc.forum_buyer,
    sc.forum_financed,
    dr.dealer_id AS direct_dealer_id,
    dr.dealer_count AS direct_dealer_count,
    cr.dealer_id AS comment_dealer_id,
    cr.dealer_group_id AS comment_dealer_group_id,
    cr.dealer_count AS comment_dealer_count,
    CASE
      WHEN dr.dealer_id IS NOT NULL
       AND cr.dealer_id IS NOT NULL
       AND dr.dealer_id <> cr.dealer_id
      THEN true ELSE false
    END AS dealer_conflict
  FROM vehiculo_canonico vc
  LEFT JOIN sale_context sc ON sc.vin = vc.vin
  LEFT JOIN direct_resolved dr ON dr.vin = vc.vin
  LEFT JOIN comment_resolved cr ON cr.vin = vc.vin
),
final_resolution AS (
  SELECT
    r.*,
    CASE
      WHEN r.dealer_conflict THEN 'DEALER'
      WHEN r.direct_dealer_id IS NOT NULL THEN 'DEALER'
      WHEN r.forum_buyer THEN 'DEALER'
      WHEN r.forum_financed AND r.comment_dealer_id IS NOT NULL THEN 'DEALER'
      WHEN r.tipo_canal_sucursal IN ('DEALER','DEALER_AGREGADO') THEN 'DEALER'
      WHEN r.tipo_canal_sucursal = 'CIDEF' THEN 'TIENDA_PROPIA'
      ELSE NULL
    END AS canal_salida,
    CASE
      WHEN r.dealer_conflict THEN NULL
      WHEN r.direct_dealer_id IS NOT NULL THEN r.direct_dealer_id
      WHEN (r.forum_buyer OR r.forum_financed) AND r.comment_dealer_count = 1 THEN r.comment_dealer_id
      ELSE NULL
    END AS dealer_id,
    CASE
      WHEN r.dealer_conflict THEN NULL
      WHEN r.direct_dealer_id IS NOT NULL THEN dm_direct.dealer_group_id
      WHEN (r.forum_buyer OR r.forum_financed) AND r.comment_dealer_group_id IS NOT NULL THEN r.comment_dealer_group_id
      ELSE NULL
    END AS dealer_group_id,
    CASE
      WHEN r.dealer_conflict THEN 'NO_RESUELTO'
      WHEN r.direct_dealer_id IS NOT NULL THEN 'DIRECTO'
      WHEN (r.forum_buyer OR r.forum_financed) AND r.comment_dealer_count = 1 THEN 'FORUM_COMENTARIO'
      WHEN r.forum_buyer OR r.tipo_canal_sucursal IN ('DEALER','DEALER_AGREGADO') THEN 'NO_RESUELTO'
      ELSE NULL
    END AS dealer_resolution_method
  FROM resolution r
  LEFT JOIN dealers_master dm_direct ON dm_direct.dealer_id = r.direct_dealer_id
)
`;

async function ensureColumns() {
  const statements = [
    `ALTER TABLE vehiculo_canonico ADD COLUMN IF NOT EXISTS canal_salida text`,
    `ALTER TABLE vehiculo_canonico ADD COLUMN IF NOT EXISTS es_tienda_propia boolean`,
    `ALTER TABLE vehiculo_canonico ADD COLUMN IF NOT EXISTS sucursal_venta_id bigint REFERENCES sucursales_master(sucursal_id)`,
    `ALTER TABLE vehiculo_canonico ADD COLUMN IF NOT EXISTS dealer_id bigint REFERENCES dealers_master(dealer_id)`,
    `ALTER TABLE vehiculo_canonico ADD COLUMN IF NOT EXISTS dealer_group_id bigint REFERENCES dealer_groups(dealer_group_id)`,
    `ALTER TABLE vehiculo_canonico ADD COLUMN IF NOT EXISTS dealer_resolution_method text`,
    `ALTER TABLE vehiculo_canonico ADD COLUMN IF NOT EXISTS vendido boolean NOT NULL DEFAULT false`,
  ];
  for (const sql of statements) await queryDb(sql);
}

async function summaryFromResolution() {
  const rows = await queryDb(`${BASE_CTE}
    SELECT
      count(*) AS universo,
      count(*) FILTER (WHERE vendido) AS vendidos,
      count(*) FILTER (WHERE canal_salida='TIENDA_PROPIA') AS tienda_propia,
      count(*) FILTER (WHERE canal_salida='DEALER') AS dealer,
      count(*) FILTER (WHERE dealer_resolution_method='DIRECTO') AS dealer_directo,
      count(*) FILTER (WHERE dealer_resolution_method='FORUM_COMENTARIO') AS dealer_via_forum,
      count(*) FILTER (WHERE canal_salida='DEALER' AND dealer_id IS NULL) AS dealer_sin_resolver,
      count(*) FILTER (WHERE dealer_conflict) AS conflictos_dealer,
      count(*) FILTER (WHERE forum_buyer) AS forum_comprador,
      count(*) FILTER (WHERE forum_financed AND NOT forum_buyer) AS forum_financiado_no_comprador
    FROM final_resolution
  `);
  return rows[0];
}

async function persistedSummary() {
  const rows = await queryDb(`
    SELECT
      count(*) AS universo,
      count(*) FILTER (WHERE vendido) AS vendidos,
      count(*) FILTER (WHERE canal_salida='TIENDA_PROPIA') AS tienda_propia,
      count(*) FILTER (WHERE canal_salida='DEALER') AS dealer,
      count(*) FILTER (WHERE dealer_resolution_method='DIRECTO') AS dealer_directo,
      count(*) FILTER (WHERE dealer_resolution_method='FORUM_COMENTARIO') AS dealer_via_forum,
      count(*) FILTER (WHERE canal_salida='DEALER' AND dealer_id IS NULL) AS dealer_sin_resolver,
      count(*) FILTER (WHERE sucursal_venta_id IS NOT NULL) AS sucursal_venta_resuelta,
      count(*) FILTER (WHERE dealer_id IS NOT NULL) AS dealer_id_resuelto,
      count(*) FILTER (WHERE dealer_group_id IS NOT NULL) AS dealer_group_resuelto,
      count(*) FILTER (WHERE canal_salida='TIENDA_PROPIA' AND (sucursal_venta_id IS NULL OR dealer_id IS NOT NULL)) AS integridad_tienda_fallida,
      count(*) FILTER (WHERE canal_salida='DEALER' AND sucursal_venta_id IS NOT NULL) AS integridad_dealer_fallida
    FROM vehiculo_canonico
  `);
  return rows[0];
}

export async function refreshVehiculoSalidaV01(options = {}) {
  const dryRun = options.dry_run !== false;
  const preview = await summaryFromResolution();

  if (dryRun) {
    return {
      phase: 'vehiculo_salida_v01',
      dry_run: true,
      preview,
    };
  }

  await ensureColumns();

  await queryDb(`${BASE_CTE}
    UPDATE vehiculo_canonico vc
       SET vendido = fr.vendido,
           canal_salida = fr.canal_salida,
           es_tienda_propia = CASE
             WHEN fr.canal_salida='TIENDA_PROPIA' THEN true
             WHEN fr.canal_salida='DEALER' THEN false
             ELSE NULL
           END,
           sucursal_venta_id = CASE WHEN fr.canal_salida='TIENDA_PROPIA' THEN fr.sucursal_id ELSE NULL END,
           dealer_id = CASE WHEN fr.canal_salida='DEALER' THEN fr.dealer_id ELSE NULL END,
           dealer_group_id = CASE WHEN fr.canal_salida='DEALER' THEN fr.dealer_group_id ELSE NULL END,
           dealer_resolution_method = CASE WHEN fr.canal_salida='DEALER' THEN fr.dealer_resolution_method ELSE NULL END
      FROM final_resolution fr
     WHERE fr.vin = vc.vin
  `);

  const summary = await persistedSummary();
  const integrityFailed = Number(summary.integridad_tienda_fallida) + Number(summary.integridad_dealer_fallida);
  if (integrityFailed !== 0) {
    throw new Error(`vehiculo_salida_v01 integrity failed: ${integrityFailed}`);
  }

  return {
    phase: 'vehiculo_salida_v01',
    dry_run: false,
    preview,
    summary,
  };
}

export async function summarizeVehiculoSalidaV01() {
  return persistedSummary();
}
