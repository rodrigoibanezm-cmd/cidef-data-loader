import { queryDb } from '../neon.js';

const BASE_CTE = `
WITH notas_unidad AS (
  SELECT
    upper(btrim(chasis)) AS vin,
    btrim(nota_de_venta) AS nota_de_venta,
    min(nullif(btrim(nro_operacion), '')) AS nro_operacion,
    min(nullif(btrim(vendedor), '')) AS vendedor_raw,
    min(nullif(btrim(desc_sucursal_vta), '')) AS sucursal_raw,
    min(nullif(btrim(modelo), '')) AS modelo_raw,
    min(nullif(btrim(fecha_creacion_nv), '')) AS fecha_creacion_nv_raw,
    min(nullif(btrim(fecha_nota_de_venta), '')) AS fecha_nota_de_venta_raw,
    min(nullif(btrim(fecha_factura), '')) AS fecha_factura_raw,
    min(nullif(btrim(tiene_operacion), '')) AS tiene_operacion_raw,
    min(nullif(btrim(esta_autorizado), '')) AS esta_autorizado_raw,
    min(nullif(btrim(reserva), '')) AS reserva_raw,
    min(nullif(btrim(esta_pendiente_entrega), '')) AS esta_pendiente_entrega_raw,
    min(nullif(btrim(etapa), '')) AS etapa,
    min(nullif(btrim(factura), '')) AS factura,
    min(nullif(btrim(entidad_financiera), '')) AS entidad_financiera,
    count(*) AS source_rows,
    count(DISTINCT nullif(btrim(numero_recibo), '')) AS recibos_distintos
  FROM notas_venta_raw
  WHERE chasis IS NOT NULL
    AND btrim(chasis) <> ''
    AND upper(btrim(chasis)) ~ '^[A-HJ-NPR-Z0-9]{17}$'
    AND nota_de_venta IS NOT NULL
    AND btrim(nota_de_venta) <> ''
  GROUP BY upper(btrim(chasis)), btrim(nota_de_venta)
),
persona_candidates AS (
  SELECT
    n.vin,
    n.nota_de_venta,
    p.persona_id
  FROM notas_unidad n
  JOIN personas_master p
    ON p.validated = true
   AND master_norm(p.usuario_canonico) = master_norm(n.vendedor_raw)
),
persona_resolved AS (
  SELECT
    vin,
    nota_de_venta,
    CASE WHEN count(DISTINCT persona_id)=1 THEN min(persona_id) END AS persona_id,
    count(DISTINCT persona_id) AS persona_matches
  FROM persona_candidates
  GROUP BY vin, nota_de_venta
),
sucursal_candidates AS (
  SELECT
    n.vin,
    n.nota_de_venta,
    sa.sucursal_id
  FROM notas_unidad n
  JOIN sucursal_aliases sa
    ON sa.validated = true
   AND sa.fuente = 'notas_venta_raw'
   AND sa.valor_normalizado = master_norm(n.sucursal_raw)
),
sucursal_resolved AS (
  SELECT
    vin,
    nota_de_venta,
    CASE WHEN count(DISTINCT sucursal_id)=1 THEN min(sucursal_id) END AS sucursal_id,
    count(DISTINCT sucursal_id) AS sucursal_matches
  FROM sucursal_candidates
  GROUP BY vin, nota_de_venta
),
producto_candidates AS (
  SELECT
    n.vin,
    n.nota_de_venta,
    pa.version_id
  FROM notas_unidad n
  JOIN producto_aliases_v01 pa
    ON pa.fuente = 'notas_venta_raw'
   AND pa.nivel = 'VERSION'
   AND pa.estado = 'RESUELTO'
   AND pa.version_id IS NOT NULL
   AND pa.valor_normalizado = master_norm(n.modelo_raw)
),
producto_resolved AS (
  SELECT
    vin,
    nota_de_venta,
    CASE WHEN count(DISTINCT version_id)=1 THEN min(version_id) END AS version_id,
    count(DISTINCT version_id) AS producto_matches
  FROM producto_candidates
  GROUP BY vin, nota_de_venta
),
ventas_candidates AS (
  SELECT
    n.vin,
    n.nota_de_venta,
    v.nro_factura,
    v.fecha_propuesta,
    v.id_tipo_operacion,
    v.desc_tipo_oper,
    v.precio_vta,
    v.precio_vta_pesos_con_iva,
    row_number() OVER (
      PARTITION BY n.vin, n.nota_de_venta
      ORDER BY v.id NULLS LAST
    ) AS rn,
    count(*) OVER (PARTITION BY n.vin, n.nota_de_venta) AS ventas_matches
  FROM notas_unidad n
  JOIN ventas_raw v
    ON upper(btrim(v.nro_vin_chasis)) = n.vin
   AND master_norm(v.nro_propuesta) = master_norm(n.nota_de_venta)
   AND n.nro_operacion IS NOT NULL
   AND master_norm(v.nro_operacion) = master_norm(n.nro_operacion)
),
ventas_resolved AS (
  SELECT *
  FROM ventas_candidates
  WHERE rn = 1
),
final_resolution AS (
  SELECT
    n.vin,
    n.nota_de_venta,
    n.nro_operacion,
    pr.persona_id,
    sr.sucursal_id,
    xr.version_id,
    n.vendedor_raw,
    n.sucursal_raw,
    n.modelo_raw,
    nullif(n.fecha_creacion_nv_raw, '')::timestamp AS fecha_creacion_nv,
    nullif(n.fecha_nota_de_venta_raw, '')::date AS fecha_nota_de_venta,
    nullif(n.fecha_factura_raw, '')::date AS fecha_factura,
    CASE n.tiene_operacion_raw WHEN '1' THEN true WHEN '0' THEN false ELSE NULL END AS tiene_operacion,
    CASE n.esta_autorizado_raw WHEN '1' THEN true WHEN '0' THEN false ELSE NULL END AS esta_autorizado,
    n.reserva_raw AS reserva,
    CASE n.esta_pendiente_entrega_raw WHEN '1' THEN true WHEN '0' THEN false ELSE NULL END AS esta_pendiente_entrega,
    n.etapa,
    n.factura,
    CASE
      WHEN n.factura IS NULL THEN NULL
      WHEN upper(n.factura) LIKE 'FVE%' THEN 'FVE'
      WHEN upper(n.factura) LIKE 'FVH%' THEN 'FVH'
      WHEN upper(n.factura) LIKE 'FVR%' THEN 'FVR'
      ELSE NULL
    END AS tipo_factura,
    vr.nro_factura,
    n.entidad_financiera,
    (n.factura IS NOT NULL) AS tiene_factura,
    (vr.vin IS NOT NULL) AS match_ventas,
    CASE
      WHEN vr.vin IS NOT NULL THEN 'VIN_NV_OPERACION'
      WHEN n.factura IS NOT NULL THEN 'NOTAS_FACTURA_SIN_MATCH_VENTAS'
      WHEN n.nro_operacion IS NULL THEN 'NV_PRE_OPERACION'
      ELSE 'NOTAS_SIN_MATCH_VENTAS'
    END AS reconciliation_method,
    n.source_rows,
    n.recibos_distintos,
    coalesce(pr.persona_matches,0) AS persona_matches,
    coalesce(sr.sucursal_matches,0) AS sucursal_matches,
    coalesce(xr.producto_matches,0) AS producto_matches
  FROM notas_unidad n
  LEFT JOIN persona_resolved pr USING(vin, nota_de_venta)
  LEFT JOIN sucursal_resolved sr USING(vin, nota_de_venta)
  LEFT JOIN producto_resolved xr USING(vin, nota_de_venta)
  LEFT JOIN ventas_resolved vr USING(vin, nota_de_venta)
)
`;

async function previewSummary() {
  const rows = await queryDb(`${BASE_CTE}
    SELECT
      count(*) AS universo,
      count(*) FILTER (WHERE nro_operacion IS NULL) AS sin_operacion,
      count(*) FILTER (WHERE tiene_operacion = true) AS flag_con_operacion,
      count(*) FILTER (WHERE nro_operacion IS NOT NULL AND tiene_operacion = false) AS conflicto_flag_operacion,
      count(*) FILTER (WHERE tiene_factura) AS facturadas_notas,
      count(*) FILTER (WHERE match_ventas) AS match_ventas,
      count(*) FILTER (WHERE tiene_factura AND NOT match_ventas) AS facturadas_sin_match_ventas,
      count(*) FILTER (WHERE persona_id IS NOT NULL) AS persona_resuelta,
      count(*) FILTER (WHERE persona_id IS NULL) AS persona_null,
      count(*) FILTER (WHERE sucursal_id IS NOT NULL) AS sucursal_resuelta,
      count(*) FILTER (WHERE sucursal_id IS NULL) AS sucursal_null,
      count(*) FILTER (WHERE version_id IS NOT NULL) AS producto_resuelto,
      count(*) FILTER (WHERE version_id IS NULL) AS producto_null,
      count(*) FILTER (WHERE persona_matches > 1) AS persona_ambigua,
      count(*) FILTER (WHERE sucursal_matches > 1) AS sucursal_ambigua,
      count(*) FILTER (WHERE producto_matches > 1) AS producto_ambiguo,
      count(*) FILTER (WHERE fecha_factura IS NOT NULL AND fecha_nota_de_venta IS NOT NULL AND fecha_factura < fecha_nota_de_venta) AS anomalia_factura_antes_nv,
      count(*) FILTER (WHERE source_rows > 1) AS unidades_con_subgrain_recibos,
      sum(greatest(source_rows - 1, 0)) AS filas_raw_colapsadas
    FROM final_resolution
  `);
  return rows[0];
}

async function ensureTable() {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS fact_operacion (
      operacion_id bigserial PRIMARY KEY,
      vin text NOT NULL,
      nota_de_venta text NOT NULL,
      nro_operacion text NULL,
      persona_id bigint NULL REFERENCES personas_master(persona_id),
      sucursal_id bigint NULL REFERENCES sucursales_master(sucursal_id),
      version_id bigint NULL REFERENCES versiones_master_v01(version_id),
      vendedor_raw text NULL,
      sucursal_raw text NULL,
      modelo_raw text NULL,
      fecha_creacion_nv timestamp NOT NULL,
      fecha_nota_de_venta date NOT NULL,
      fecha_factura date NULL,
      tiene_operacion boolean NULL,
      esta_autorizado boolean NULL,
      reserva text NULL,
      esta_pendiente_entrega boolean NULL,
      tiene_factura boolean NOT NULL,
      etapa text NULL,
      factura text NULL,
      tipo_factura text NULL,
      nro_factura text NULL,
      entidad_financiera text NULL,
      match_ventas boolean NOT NULL,
      reconciliation_method text NULL,
      source_table text NOT NULL DEFAULT 'notas_venta_raw',
      source_vin_raw text NOT NULL,
      canonicalized_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (vin, nota_de_venta)
    )
  `);
}

async function writeFact() {
  await queryDb(`${BASE_CTE}
    INSERT INTO fact_operacion (
      vin, nota_de_venta, nro_operacion,
      persona_id, sucursal_id, version_id,
      vendedor_raw, sucursal_raw, modelo_raw,
      fecha_creacion_nv, fecha_nota_de_venta, fecha_factura,
      tiene_operacion, esta_autorizado, reserva, esta_pendiente_entrega,
      tiene_factura, etapa, factura, tipo_factura, nro_factura,
      entidad_financiera, match_ventas, reconciliation_method,
      source_table, source_vin_raw, canonicalized_at
    )
    SELECT
      vin, nota_de_venta, nro_operacion,
      persona_id, sucursal_id, version_id,
      vendedor_raw, sucursal_raw, modelo_raw,
      fecha_creacion_nv, fecha_nota_de_venta, fecha_factura,
      tiene_operacion, esta_autorizado, reserva, esta_pendiente_entrega,
      tiene_factura, etapa, factura, tipo_factura, nro_factura,
      entidad_financiera, match_ventas, reconciliation_method,
      'notas_venta_raw', vin, now()
    FROM final_resolution
    ON CONFLICT (vin, nota_de_venta) DO UPDATE SET
      nro_operacion = EXCLUDED.nro_operacion,
      persona_id = EXCLUDED.persona_id,
      sucursal_id = EXCLUDED.sucursal_id,
      version_id = EXCLUDED.version_id,
      vendedor_raw = EXCLUDED.vendedor_raw,
      sucursal_raw = EXCLUDED.sucursal_raw,
      modelo_raw = EXCLUDED.modelo_raw,
      fecha_creacion_nv = EXCLUDED.fecha_creacion_nv,
      fecha_nota_de_venta = EXCLUDED.fecha_nota_de_venta,
      fecha_factura = EXCLUDED.fecha_factura,
      tiene_operacion = EXCLUDED.tiene_operacion,
      esta_autorizado = EXCLUDED.esta_autorizado,
      reserva = EXCLUDED.reserva,
      esta_pendiente_entrega = EXCLUDED.esta_pendiente_entrega,
      tiene_factura = EXCLUDED.tiene_factura,
      etapa = EXCLUDED.etapa,
      factura = EXCLUDED.factura,
      tipo_factura = EXCLUDED.tipo_factura,
      nro_factura = EXCLUDED.nro_factura,
      entidad_financiera = EXCLUDED.entidad_financiera,
      match_ventas = EXCLUDED.match_ventas,
      reconciliation_method = EXCLUDED.reconciliation_method,
      source_table = EXCLUDED.source_table,
      source_vin_raw = EXCLUDED.source_vin_raw,
      canonicalized_at = now()
  `);

  await queryDb(`${BASE_CTE}
    DELETE FROM fact_operacion f
    WHERE NOT EXISTS (
      SELECT 1
      FROM final_resolution r
      WHERE r.vin = f.vin
        AND r.nota_de_venta = f.nota_de_venta
    )
  `);
}

async function persistedSummary() {
  const rows = await queryDb(`
    SELECT
      count(*) AS universo,
      count(*) FILTER (WHERE nro_operacion IS NULL) AS sin_operacion,
      count(*) FILTER (WHERE tiene_factura) AS facturadas_notas,
      count(*) FILTER (WHERE match_ventas) AS match_ventas,
      count(*) FILTER (WHERE tiene_factura AND NOT match_ventas) AS facturadas_sin_match_ventas,
      count(*) FILTER (WHERE persona_id IS NOT NULL) AS persona_resuelta,
      count(*) FILTER (WHERE persona_id IS NULL) AS persona_null,
      count(*) FILTER (WHERE sucursal_id IS NOT NULL) AS sucursal_resuelta,
      count(*) FILTER (WHERE sucursal_id IS NULL) AS sucursal_null,
      count(*) FILTER (WHERE version_id IS NOT NULL) AS producto_resuelto,
      count(*) FILTER (WHERE version_id IS NULL) AS producto_null,
      count(*) FILTER (WHERE fecha_factura IS NOT NULL AND fecha_nota_de_venta IS NOT NULL AND fecha_factura < fecha_nota_de_venta) AS anomalia_factura_antes_nv,
      count(*) - count(DISTINCT (vin, nota_de_venta)) AS duplicados_grain,
      count(*) FILTER (WHERE persona_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM personas_master p WHERE p.persona_id=fact_operacion.persona_id)) AS fk_persona_rota,
      count(*) FILTER (WHERE sucursal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sucursales_master s WHERE s.sucursal_id=fact_operacion.sucursal_id)) AS fk_sucursal_rota,
      count(*) FILTER (WHERE version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM versiones_master_v01 v WHERE v.version_id=fact_operacion.version_id)) AS fk_version_rota
    FROM fact_operacion
  `);
  return rows[0];
}

export async function refreshFactOperacionV01(options = {}) {
  const dryRun = options.dry_run !== false;
  const preview = await previewSummary();

  if (dryRun) {
    return {
      phase: 'fact_operacion_v01',
      dry_run: true,
      preview,
      contract: {
        grain: 'VIN + nota_de_venta',
        source_base: 'notas_venta_raw',
        product_master: 'versiones_master_v01/producto_aliases_v01',
        ventas_role: 'reconciliation_enrichment',
      },
    };
  }

  await ensureTable();
  await writeFact();
  const summary = await persistedSummary();

  if (Number(summary.duplicados_grain) !== 0) {
    throw new Error(`fact_operacion integrity failed: duplicate grain=${summary.duplicados_grain}`);
  }
  if (Number(summary.fk_persona_rota) !== 0 || Number(summary.fk_sucursal_rota) !== 0 || Number(summary.fk_version_rota) !== 0) {
    throw new Error('fact_operacion integrity failed: broken MASTER foreign key');
  }

  return {
    phase: 'fact_operacion_v01',
    dry_run: false,
    preview,
    summary,
  };
}

export async function summarizeFactOperacionV01() {
  return {
    phase: 'fact_operacion_v01_summary',
    summary: await persistedSummary(),
  };
}
