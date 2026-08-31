import { queryDb } from '../neon.js';

const INTERNAL_SOURCES = "('vehiculos_raw','ventas_raw','notas_venta_raw')";

const brandCanon = (expr) => `CASE
  WHEN master_norm(${expr}) IN ('DFM','DFLM','DONG FENG','DONGFENG','ZNA DONGFENG') THEN 'DONGFENG'
  WHEN master_norm(${expr}) IN ('LEAP MOTOR','LEAPMOTOR') THEN 'LEAPMOTOR'
  ELSE master_norm(${expr})
END`;

const evToken = (expr) => `coalesce(master_norm(${expr}),'') ~ '(^|[^A-Z0-9])EV([^A-Z0-9]|$)'`;

export async function refreshProductAliasesFinalReset() {
  await queryDb(`
    UPDATE producto_aliases_v01 a
    SET estado = CASE WHEN ma.nombre_normalizado='ZNA' THEN 'RESUELTO' ELSE 'AMBIGUO' END,
        updated_at = now()
    FROM marcas_master_v01 ma
    WHERE a.marca_id=ma.marca_id
      AND a.fuente='rvm_raw'
      AND a.nivel='MARCA'
      AND a.valor_normalizado='ZNA'
  `);

  await queryDb(`
    UPDATE producto_aliases_v01 a
    SET estado='AMBIGUO', updated_at=now()
    FROM modelos_master_v01 mo
    WHERE a.modelo_id=mo.modelo_id
      AND a.fuente='rvm_raw'
      AND a.nivel='MODELO'
      AND a.valor_normalizado='S50'
      AND master_norm(coalesce(a.contexto_marca_raw,''))='DFM'
      AND master_norm(coalesce(a.contexto_modelo_raw,''))='S50 EV AUT'
      AND mo.nombre_normalizado='MAGE EV'
  `);

  await queryDb(`
    DELETE FROM producto_aliases_v01
    WHERE fuente IN ${INTERNAL_SOURCES}
      AND nivel='VERSION'
  `);

  return finalSummary();
}

export async function refreshProductAliasesFinalExact() {
  const sql = `
    WITH current_versions AS (
      SELECT DISTINCT
        ma.marca_id,
        ma.nombre_normalizado AS marca_norm,
        mo.modelo_id,
        mo.nombre_normalizado AS modelo_norm,
        ve.version_id,
        ve.nombre_normalizado AS version_norm
      FROM producto_portafolio_v01 p
      JOIN marcas_master_v01 ma ON ma.marca_id=p.marca_id
      JOIN modelos_master_v01 mo ON mo.modelo_id=p.modelo_id
      JOIN versiones_master_v01 ve ON ve.version_id=p.version_id
      WHERE p.vigente=true
        AND p.organizacion='CIDEF'
    ), source_rows AS (
      SELECT 'vehiculos_raw'::text AS fuente,
             trim(modelo) AS sku_raw,
             master_norm(modelo) AS sku_norm,
             trim(marca) AS marca_raw,
             ${brandCanon('marca')} AS marca_norm,
             NULL::text AS comercial_norm
      FROM vehiculos_raw
      WHERE master_norm(modelo) IS NOT NULL

      UNION ALL

      SELECT 'ventas_raw',trim(articulo),master_norm(articulo),trim(desc_mae_marca),
             ${brandCanon('desc_mae_marca')},master_norm(desc_articulo)
      FROM ventas_raw
      WHERE master_norm(articulo) IS NOT NULL

      UNION ALL

      SELECT 'notas_venta_raw',trim(modelo),master_norm(modelo),trim(desc_mae_marca),
             ${brandCanon('desc_mae_marca')},master_norm(modelo_comercial)
      FROM notas_venta_raw
      WHERE master_norm(modelo) IS NOT NULL
    ), source_keys AS (
      SELECT fuente,marca_norm,sku_norm,marca_raw,min(sku_raw) AS sku_raw,count(*) AS source_rows
      FROM source_rows
      WHERE marca_norm IS NOT NULL
      GROUP BY fuente,marca_norm,sku_norm,marca_raw
    ), sku_keys AS (
      SELECT marca_norm,sku_norm,count(*) AS evidence_n
      FROM source_rows
      WHERE marca_norm IS NOT NULL
      GROUP BY marca_norm,sku_norm
    ), commercial_evidence AS (
      SELECT marca_norm,sku_norm,comercial_norm,count(*) AS evidence_n
      FROM source_rows
      WHERE marca_norm IS NOT NULL AND comercial_norm IS NOT NULL
      GROUP BY marca_norm,sku_norm,comercial_norm
    ), semantics AS (
      SELECT marca_norm,sku_norm,
             bool_or(${evToken('sku_norm')} OR ${evToken('comercial_norm')}) AS source_ev
      FROM source_rows
      WHERE marca_norm IS NOT NULL
      GROUP BY marca_norm,sku_norm
    ), sku_exact AS (
      SELECT s.marca_norm,s.sku_norm,c.marca_id,c.modelo_id,c.version_id,
             'SKU_VERSION_EXACTO'::text AS metodo,1 AS prioridad,s.evidence_n
      FROM sku_keys s
      JOIN current_versions c
        ON c.marca_norm=s.marca_norm
       AND c.version_norm=s.sku_norm
    ), commercial_exact AS (
      SELECT e.marca_norm,e.sku_norm,c.marca_id,c.modelo_id,c.version_id,
             'COMERCIAL_VERSION_EXACTO'::text AS metodo,2 AS prioridad,e.evidence_n
      FROM commercial_evidence e
      JOIN current_versions c
        ON c.marca_norm=e.marca_norm
       AND c.version_norm=e.comercial_norm
    ), rvm_model_matches AS (
      SELECT e.marca_norm,e.sku_norm,a.modelo_id,sum(e.evidence_n) AS evidence_n
      FROM commercial_evidence e
      JOIN producto_aliases_v01 a
        ON a.fuente='rvm_raw'
       AND a.nivel='MODELO'
       AND a.estado='RESUELTO'
       AND (
         a.valor_normalizado=e.comercial_norm
         OR master_norm(a.contexto_modelo_raw)=e.comercial_norm
       )
      JOIN marcas_master_v01 ma
        ON ma.marca_id=a.marca_id
       AND ma.nombre_normalizado=e.marca_norm
      WHERE a.modelo_id IS NOT NULL
      GROUP BY e.marca_norm,e.sku_norm,a.modelo_id
    ), rvm_model_unique AS (
      SELECT marca_norm,sku_norm,min(modelo_id) AS modelo_id,sum(evidence_n) AS evidence_n
      FROM rvm_model_matches
      GROUP BY marca_norm,sku_norm
      HAVING count(DISTINCT modelo_id)=1
    ), current_single_version_models AS (
      SELECT modelo_id,min(marca_id) AS marca_id,min(version_id) AS version_id
      FROM current_versions
      GROUP BY modelo_id
      HAVING count(DISTINCT version_id)=1
    ), rvm_single_version AS (
      SELECT r.marca_norm,r.sku_norm,c.marca_id,r.modelo_id,c.version_id,
             'COMERCIAL_RVM_MODELO_UNICO_VERSION_UNICA'::text AS metodo,
             3 AS prioridad,r.evidence_n
      FROM rvm_model_unique r
      JOIN current_single_version_models c USING(modelo_id)
      JOIN marcas_master_v01 ma ON ma.marca_id=c.marca_id AND ma.nombre_normalizado=r.marca_norm
    ), raw_candidates AS (
      SELECT * FROM sku_exact
      UNION ALL SELECT * FROM commercial_exact
      UNION ALL SELECT * FROM rvm_single_version
    ), valid_candidates AS (
      SELECT c.*
      FROM raw_candidates c
      JOIN current_versions cv ON cv.version_id=c.version_id
      JOIN semantics s
        ON s.marca_norm=c.marca_norm
       AND s.sku_norm=c.sku_norm
      WHERE s.source_ev = (${evToken('cv.modelo_norm')})
    ), candidate_rollup AS (
      SELECT marca_norm,sku_norm,marca_id,modelo_id,version_id,metodo,prioridad,
             sum(evidence_n) AS evidence_n
      FROM valid_candidates
      GROUP BY marca_norm,sku_norm,marca_id,modelo_id,version_id,metodo,prioridad
    ), state AS (
      SELECT marca_norm,sku_norm,count(DISTINCT version_id) AS destinos
      FROM candidate_rollup
      GROUP BY marca_norm,sku_norm
    ), ranked AS (
      SELECT c.*,
             row_number() OVER (
               PARTITION BY c.marca_norm,c.sku_norm,c.version_id
               ORDER BY c.prioridad,c.metodo
             ) AS rn
      FROM candidate_rollup c
    ), resolved AS (
      SELECT r.marca_norm,r.sku_norm,r.marca_id,r.modelo_id,r.version_id,
             r.metodo,r.evidence_n
      FROM ranked r
      JOIN state s USING(marca_norm,sku_norm)
      WHERE s.destinos=1 AND r.rn=1
    ), inserted_resolved AS (
      INSERT INTO producto_aliases_v01(
        nivel,fuente,valor_raw,valor_normalizado,contexto_marca_raw,
        marca_id,modelo_id,version_id,evidencia_tipo,evidencia_count,estado
      )
      SELECT 'VERSION',k.fuente,k.sku_raw,k.sku_norm,k.marca_raw,
             r.marca_id,r.modelo_id,r.version_id,r.metodo,
             greatest(1,r.evidence_n),'RESUELTO'
      FROM source_keys k
      JOIN resolved r USING(marca_norm,sku_norm)
      ON CONFLICT DO NOTHING
      RETURNING 1
    ), inserted_ambiguous AS (
      INSERT INTO producto_aliases_v01(
        nivel,fuente,valor_raw,valor_normalizado,contexto_marca_raw,
        marca_id,modelo_id,version_id,evidencia_tipo,evidencia_count,estado
      )
      SELECT 'VERSION',k.fuente,k.sku_raw,k.sku_norm,k.marca_raw,
             r.marca_id,r.modelo_id,r.version_id,r.metodo,
             greatest(1,r.evidence_n),'AMBIGUO'
      FROM source_keys k
      JOIN state s USING(marca_norm,sku_norm)
      JOIN ranked r USING(marca_norm,sku_norm)
      WHERE s.destinos>1 AND r.rn=1
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM inserted_resolved) AS inserted_resolved,
      (SELECT count(*) FROM inserted_ambiguous) AS inserted_ambiguous
  `;

  const result = await queryDb(sql);
  return { phase: 'exact', ...result[0], summary: await finalSummary() };
}

export async function refreshProductAliasesFinalVin() {
  const sql = `
    WITH current_versions AS (
      SELECT DISTINCT
        ma.marca_id,
        ma.nombre_normalizado AS marca_norm,
        mo.modelo_id,
        mo.nombre_normalizado AS modelo_norm,
        ve.version_id
      FROM producto_portafolio_v01 p
      JOIN marcas_master_v01 ma ON ma.marca_id=p.marca_id
      JOIN modelos_master_v01 mo ON mo.modelo_id=p.modelo_id
      JOIN versiones_master_v01 ve ON ve.version_id=p.version_id
      WHERE p.vigente=true AND p.organizacion='CIDEF'
    ), source_rows AS (
      SELECT 'vehiculos_raw'::text AS fuente,trim(modelo) AS sku_raw,master_norm(modelo) AS sku_norm,
             trim(marca) AS marca_raw,${brandCanon('marca')} AS marca_norm,
             upper(trim(vin_chasis)) AS vin_norm,NULL::text AS comercial_norm
      FROM vehiculos_raw
      WHERE master_norm(modelo) IS NOT NULL

      UNION ALL

      SELECT 'ventas_raw',trim(articulo),master_norm(articulo),trim(desc_mae_marca),
             ${brandCanon('desc_mae_marca')},upper(trim(nro_vin_chasis)),master_norm(desc_articulo)
      FROM ventas_raw
      WHERE master_norm(articulo) IS NOT NULL

      UNION ALL

      SELECT 'notas_venta_raw',trim(modelo),master_norm(modelo),trim(desc_mae_marca),
             ${brandCanon('desc_mae_marca')},upper(trim(chasis)),master_norm(modelo_comercial)
      FROM notas_venta_raw
      WHERE master_norm(modelo) IS NOT NULL
    ), source_keys AS (
      SELECT fuente,marca_norm,sku_norm,marca_raw,min(sku_raw) AS sku_raw
      FROM source_rows
      WHERE marca_norm IS NOT NULL
      GROUP BY fuente,marca_norm,sku_norm,marca_raw
    ), semantics AS (
      SELECT marca_norm,sku_norm,
             bool_or(${evToken('sku_norm')} OR ${evToken('comercial_norm')}) AS source_ev
      FROM source_rows
      WHERE marca_norm IS NOT NULL
      GROUP BY marca_norm,sku_norm
    ), resolved_keys AS (
      SELECT ma.nombre_normalizado AS marca_norm,a.valor_normalizado AS sku_norm,
             min(a.version_id) AS version_id
      FROM producto_aliases_v01 a
      JOIN marcas_master_v01 ma ON ma.marca_id=a.marca_id
      WHERE a.fuente IN ${INTERNAL_SOURCES}
        AND a.nivel='VERSION'
        AND a.estado='RESUELTO'
        AND a.version_id IS NOT NULL
      GROUP BY ma.nombre_normalizado,a.valor_normalizado
      HAVING count(DISTINCT a.version_id)=1
    ), anchor_observations AS (
      SELECT DISTINCT r.vin_norm,k.version_id
      FROM source_rows r
      JOIN resolved_keys k USING(marca_norm,sku_norm)
      WHERE nullif(r.vin_norm,'') IS NOT NULL
    ), vin_anchors AS (
      SELECT vin_norm,min(version_id) AS version_id
      FROM anchor_observations
      GROUP BY vin_norm
      HAVING count(DISTINCT version_id)=1
    ), candidate_vins AS (
      SELECT DISTINCT r.marca_norm,r.sku_norm,r.vin_norm
      FROM source_rows r
      WHERE nullif(r.vin_norm,'') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM resolved_keys k
          WHERE k.marca_norm=r.marca_norm AND k.sku_norm=r.sku_norm
        )
    ), vin_stats AS (
      SELECT c.marca_norm,c.sku_norm,
             count(*) AS total_vins,
             count(a.vin_norm) AS anchored_vins,
             count(DISTINCT a.version_id) FILTER(WHERE a.version_id IS NOT NULL) AS destinos,
             min(a.version_id) AS version_id
      FROM candidate_vins c
      LEFT JOIN vin_anchors a ON a.vin_norm=c.vin_norm
      GROUP BY c.marca_norm,c.sku_norm
    ), resolved_vin AS (
      SELECT v.marca_norm,v.sku_norm,cv.marca_id,cv.modelo_id,cv.version_id,v.total_vins
      FROM vin_stats v
      JOIN current_versions cv
        ON cv.version_id=v.version_id
       AND cv.marca_norm=v.marca_norm
      JOIN semantics s
        ON s.marca_norm=v.marca_norm
       AND s.sku_norm=v.sku_norm
      WHERE v.total_vins>0
        AND v.anchored_vins=v.total_vins
        AND v.destinos=1
        AND s.source_ev = (${evToken('cv.modelo_norm')})
    ), inserted AS (
      INSERT INTO producto_aliases_v01(
        nivel,fuente,valor_raw,valor_normalizado,contexto_marca_raw,
        marca_id,modelo_id,version_id,evidencia_tipo,evidencia_count,estado
      )
      SELECT 'VERSION',k.fuente,k.sku_raw,k.sku_norm,k.marca_raw,
             r.marca_id,r.modelo_id,r.version_id,
             'VIN_EQUIVALENCIA_COMPLETA',r.total_vins,'RESUELTO'
      FROM source_keys k
      JOIN resolved_vin r USING(marca_norm,sku_norm)
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT count(*) AS inserted_resolved FROM inserted
  `;

  const result = await queryDb(sql);
  return { phase: 'vin', ...result[0], summary: await finalSummary() };
}

export async function refreshProductAliasesFinal() {
  await refreshProductAliasesFinalReset();
  await refreshProductAliasesFinalExact();
  return finalSummary();
}

export async function refreshProductAliasesFinalSummary() {
  return finalSummary();
}

async function finalSummary() {
  const rows = await queryDb(`
    WITH source_rows AS (
      SELECT 'vehiculos_raw'::text AS fuente,master_norm(modelo) AS sku_norm,count(*) AS rows_n
      FROM vehiculos_raw GROUP BY master_norm(modelo)
      UNION ALL
      SELECT 'ventas_raw',master_norm(articulo),count(*) FROM ventas_raw GROUP BY master_norm(articulo)
      UNION ALL
      SELECT 'notas_venta_raw',master_norm(modelo),count(*) FROM notas_venta_raw GROUP BY master_norm(modelo)
    ), totals AS (
      SELECT fuente,sum(rows_n) AS total_rows,count(*) FILTER(WHERE sku_norm IS NOT NULL) AS total_sku
      FROM source_rows GROUP BY fuente
    ), resolved_keys AS (
      SELECT fuente,valor_normalizado AS sku_norm
      FROM producto_aliases_v01
      WHERE fuente IN ${INTERNAL_SOURCES}
        AND nivel='VERSION' AND estado='RESUELTO'
      GROUP BY fuente,valor_normalizado
    ), resolved AS (
      SELECT s.fuente,sum(s.rows_n) AS resolved_rows,count(*) AS resolved_sku
      FROM source_rows s
      JOIN resolved_keys r USING(fuente,sku_norm)
      WHERE s.sku_norm IS NOT NULL
      GROUP BY s.fuente
    ), conflicts AS (
      SELECT fuente,nivel,valor_normalizado,
             coalesce(contexto_marca_raw,'') AS contexto_marca_raw,
             coalesce(contexto_modelo_raw,'') AS contexto_modelo_raw
      FROM producto_aliases_v01
      WHERE estado='RESUELTO'
      GROUP BY 1,2,3,4,5
      HAVING count(DISTINCT coalesce(version_id,modelo_id,marca_id))>1
    ), evidence AS (
      SELECT evidencia_tipo,count(*) AS aliases
      FROM producto_aliases_v01
      WHERE fuente IN ${INTERNAL_SOURCES} AND nivel='VERSION'
      GROUP BY evidencia_tipo
    )
    SELECT
      (SELECT count(*) FROM producto_aliases_v01) AS aliases_total,
      (SELECT count(*) FROM producto_aliases_v01 WHERE fuente IN ${INTERNAL_SOURCES} AND nivel='VERSION' AND estado='RESUELTO') AS internal_resolved_aliases,
      (SELECT count(*) FROM producto_aliases_v01 WHERE fuente IN ${INTERNAL_SOURCES} AND nivel='VERSION' AND estado='AMBIGUO') AS internal_ambiguous_aliases,
      (SELECT jsonb_object_agg(t.fuente,jsonb_build_object(
        'total_rows',t.total_rows,
        'resolved_rows',coalesce(r.resolved_rows,0),
        'total_sku',t.total_sku,
        'resolved_sku',coalesce(r.resolved_sku,0),
        'unresolved_sku',t.total_sku-coalesce(r.resolved_sku,0)
      )) FROM totals t LEFT JOIN resolved r USING(fuente)) AS coverage,
      (SELECT jsonb_object_agg(evidencia_tipo,aliases) FROM evidence) AS evidence_types,
      (SELECT count(*) FROM conflicts) AS resolved_multi_destination_keys
  `);
  return rows[0];
}
