import { queryDb } from '../neon.js';
import { refreshProductAliasesV01 } from './product-aliases-v01.js';

const BRAND_CANON = `CASE
  WHEN master_norm(src_marca) IN ('DFM','DFLM','DONG FENG','DONGFENG','ZNA DONGFENG') THEN 'DONGFENG'
  WHEN master_norm(src_marca) IN ('LEAP MOTOR','LEAPMOTOR') THEN 'LEAPMOTOR'
  ELSE master_norm(src_marca)
END`;

const RVM_BRAND_CANON = `CASE
  WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG') THEN 'DONGFENG'
  WHEN master_norm(r.marca)='ZNA'
    AND master_norm(r.modelo_homologado) IN ('NEW RICH','DF6')
    AND master_norm(r.modeo_version) LIKE 'RICH 6%' THEN 'DONGFENG'
  WHEN master_norm(r.marca) IN ('LEAP MOTOR','LEAPMOTOR') THEN 'LEAPMOTOR'
  ELSE master_norm(r.marca)
END`;

const RVM_MODEL_CANON = `CASE
  WHEN master_norm(r.marca)='ZNA'
    AND master_norm(r.modelo_homologado) IN ('NEW RICH','DF6')
    AND master_norm(r.modeo_version) LIKE 'RICH 6%' THEN 'RICH 6'
  WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
    AND master_norm(r.modelo_homologado)='DF6'
    AND master_norm(r.modeo_version) LIKE 'RICH 6%' THEN 'RICH 6'
  WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
    AND master_norm(r.modelo_homologado)='T5L' THEN 'T5 L'
  WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
    AND master_norm(r.modelo_homologado)='T5 EVO'
    AND master_norm(r.modeo_version) LIKE 'T5 1.6%' THEN 'T5'
  WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
    AND master_norm(r.modelo_homologado)='MAGE'
    AND master_norm(r.modeo_version) LIKE '%MAGE EV%' THEN 'MAGE EV'
  WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
    AND master_norm(r.modelo_homologado)='S50'
    AND EXISTS (
      SELECT 1
      FROM vehiculos_raw v
      WHERE master_norm(v.vin_chasis)=master_norm(r.vin)
        AND master_norm(v.modelo)='MAGE EV'
    ) THEN 'MAGE EV'
  WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
    AND master_norm(r.modelo_homologado)='S50'
    AND master_norm(r.modeo_version) LIKE '%S50 EV%' THEN 'S50 EV'
  WHEN master_norm(r.marca)='FOTON'
    AND master_norm(r.modelo_homologado)='FOTON G7'
    AND master_norm(r.modeo_version) LIKE '%EV%' THEN 'G7 EV'
  WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='FOTON G7' THEN 'G7'
  WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='VIEW' THEN 'VIEW GRAND'
  WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='FOTON FURGON FT' THEN 'FT'
  ELSE master_norm(r.modelo_homologado)
END`;

async function rebuildSourceAliasesV02(source, table, skuColumn, brandColumn, vinColumn) {
  const sql = `
    WITH observed_names AS (
      SELECT articulo AS sku, desc_mae_marca AS src_marca, desc_articulo AS nombre
      FROM ventas_raw
      WHERE master_norm(articulo) IS NOT NULL
        AND master_norm(desc_articulo) IS NOT NULL
      UNION ALL
      SELECT modelo, desc_mae_marca, modelo_comercial
      FROM notas_venta_raw
      WHERE master_norm(modelo) IS NOT NULL
        AND master_norm(modelo_comercial) IS NOT NULL
    ), name_normalized AS (
      SELECT
        master_norm(sku) AS sku_norm,
        ${BRAND_CANON} AS marca_norm,
        master_norm(nombre) AS nombre_norm
      FROM observed_names
    ), name_unique AS (
      SELECT
        sku_norm,
        min(marca_norm) AS marca_norm,
        min(nombre_norm) AS nombre_norm,
        count(*) AS evidence_n
      FROM name_normalized
      WHERE marca_norm IS NOT NULL AND nombre_norm IS NOT NULL
      GROUP BY sku_norm
      HAVING count(DISTINCT marca_norm)=1
         AND count(DISTINCT nombre_norm)=1
    ), name_candidates AS (
      SELECT
        n.sku_norm,
        ma.marca_id,
        mo.modelo_id,
        ve.version_id,
        n.evidence_n
      FROM name_unique n
      JOIN marcas_master_v01 ma ON ma.nombre_normalizado=n.marca_norm
      JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id
      JOIN versiones_master_v01 ve ON ve.modelo_id=mo.modelo_id
      WHERE n.nombre_norm=ve.nombre_normalizado
         OR strpos(n.nombre_norm,ve.nombre_normalizado)>0
         OR strpos(ve.nombre_normalizado,n.nombre_norm)>0
    ), source_vins AS (
      SELECT DISTINCT master_norm(${skuColumn}) AS sku_norm, master_norm(${vinColumn}) AS vin_norm
      FROM ${table}
      WHERE master_norm(${skuColumn}) IS NOT NULL
        AND master_norm(${vinColumn}) IS NOT NULL
    ), rvm_observed AS (
      SELECT
        s.sku_norm,
        ${RVM_BRAND_CANON} AS marca_norm,
        ${RVM_MODEL_CANON} AS modelo_norm,
        master_norm(r.modeo_version) AS version_norm,
        count(*) AS evidence_n
      FROM source_vins s
      JOIN rvm_raw r ON master_norm(r.vin)=s.vin_norm
      WHERE master_norm(r.modelo_homologado) IS NOT NULL
      GROUP BY s.sku_norm, ${RVM_BRAND_CANON}, ${RVM_MODEL_CANON}, master_norm(r.modeo_version)
    ), rvm_version_candidates AS (
      SELECT
        ro.sku_norm,
        ma.marca_id,
        mo.modelo_id,
        ve.version_id,
        ro.evidence_n
      FROM rvm_observed ro
      JOIN marcas_master_v01 ma ON ma.nombre_normalizado=ro.marca_norm
      JOIN modelos_master_v01 mo
        ON mo.marca_id=ma.marca_id
       AND mo.nombre_normalizado=ro.modelo_norm
      JOIN versiones_master_v01 ve ON ve.modelo_id=mo.modelo_id
      WHERE ro.version_norm IS NOT NULL
        AND (
          ro.version_norm=ve.nombre_normalizado
          OR strpos(ro.version_norm,ve.nombre_normalizado)>0
          OR strpos(ve.nombre_normalizado,ro.version_norm)>0
        )
    ), rvm_model_unique AS (
      SELECT
        ro.sku_norm,
        min(ma.marca_id) AS marca_id,
        min(mo.modelo_id) AS modelo_id,
        sum(ro.evidence_n) AS evidence_n
      FROM rvm_observed ro
      JOIN marcas_master_v01 ma ON ma.nombre_normalizado=ro.marca_norm
      JOIN modelos_master_v01 mo
        ON mo.marca_id=ma.marca_id
       AND mo.nombre_normalizado=ro.modelo_norm
      GROUP BY ro.sku_norm
      HAVING count(DISTINCT mo.modelo_id)=1
    ), single_version_models AS (
      SELECT modelo_id,min(version_id) AS version_id
      FROM versiones_master_v01
      GROUP BY modelo_id
      HAVING count(*)=1
    ), model_single_candidates AS (
      SELECT
        rm.sku_norm,
        rm.marca_id,
        rm.modelo_id,
        sv.version_id,
        rm.evidence_n
      FROM rvm_model_unique rm
      JOIN single_version_models sv USING (modelo_id)
    ), all_candidates AS (
      SELECT sku_norm,marca_id,modelo_id,version_id,evidence_n FROM name_candidates
      UNION ALL
      SELECT sku_norm,marca_id,modelo_id,version_id,evidence_n FROM rvm_version_candidates
      UNION ALL
      SELECT sku_norm,marca_id,modelo_id,version_id,evidence_n FROM model_single_candidates
    ), resolved AS (
      SELECT
        sku_norm,
        min(marca_id) AS marca_id,
        min(modelo_id) AS modelo_id,
        min(version_id) AS version_id,
        sum(evidence_n) AS evidence_count
      FROM all_candidates
      GROUP BY sku_norm
      HAVING count(DISTINCT version_id)=1
    ), source_values AS (
      SELECT
        master_norm(${skuColumn}) AS sku_norm,
        min(trim(${skuColumn})) AS valor_raw,
        min(trim(${brandColumn})) AS contexto_marca_raw,
        count(*) AS source_rows
      FROM ${table}
      WHERE master_norm(${skuColumn}) IS NOT NULL
      GROUP BY master_norm(${skuColumn})
    )
    INSERT INTO producto_aliases_v01(
      nivel,fuente,valor_raw,valor_normalizado,contexto_marca_raw,
      marca_id,modelo_id,version_id,evidencia_tipo,evidencia_count,estado
    )
    SELECT
      'VERSION',$1,s.valor_raw,s.sku_norm,s.contexto_marca_raw,
      r.marca_id,r.modelo_id,r.version_id,'SKU_CONSENSO_DETERMINISTICO_V02',
      greatest(1,r.evidence_count),'RESUELTO'
    FROM source_values s
    JOIN resolved r USING (sku_norm)
    ON CONFLICT DO NOTHING
  `;

  await queryDb(sql, [source]);
}

export async function refreshProductAliasesV02() {
  await refreshProductAliasesV01();

  await rebuildSourceAliasesV02(
    'ventas_raw',
    'ventas_raw',
    'articulo',
    'desc_mae_marca',
    'nro_vin_chasis'
  );
  await rebuildSourceAliasesV02(
    'notas_venta_raw',
    'notas_venta_raw',
    'modelo',
    'desc_mae_marca',
    'chasis'
  );
  await rebuildSourceAliasesV02(
    'vehiculos_raw',
    'vehiculos_raw',
    'modelo',
    'marca',
    'vin_chasis'
  );

  const summary = await queryDb(`
    WITH conflicts AS (
      SELECT
        fuente,nivel,valor_normalizado,
        coalesce(contexto_marca_raw,'') contexto_marca_raw,
        coalesce(contexto_modelo_raw,'') contexto_modelo_raw
      FROM producto_aliases_v01
      WHERE estado='RESUELTO'
      GROUP BY 1,2,3,4,5
      HAVING count(DISTINCT coalesce(version_id,modelo_id,marca_id))>1
    ), sku_counts AS (
      SELECT 'vehiculos_raw' fuente,
             count(DISTINCT master_norm(modelo)) FILTER (WHERE master_norm(modelo) IS NOT NULL) total_sku
      FROM vehiculos_raw
      UNION ALL
      SELECT 'ventas_raw',count(DISTINCT master_norm(articulo)) FILTER (WHERE master_norm(articulo) IS NOT NULL)
      FROM ventas_raw
      UNION ALL
      SELECT 'notas_venta_raw',count(DISTINCT master_norm(modelo)) FILTER (WHERE master_norm(modelo) IS NOT NULL)
      FROM notas_venta_raw
    ), resolved_counts AS (
      SELECT fuente,count(DISTINCT valor_normalizado) resolved_sku
      FROM producto_aliases_v01
      WHERE nivel='VERSION'
        AND estado='RESUELTO'
        AND fuente IN ('vehiculos_raw','ventas_raw','notas_venta_raw')
      GROUP BY fuente
    )
    SELECT
      (SELECT count(*) FROM producto_aliases_v01) AS aliases_total,
      (SELECT count(*) FROM producto_aliases_v01 WHERE fuente='vehiculos_raw' AND nivel='VERSION' AND estado='RESUELTO') AS vehiculos_aliases,
      (SELECT count(*) FROM producto_aliases_v01 WHERE fuente='ventas_raw' AND nivel='VERSION' AND estado='RESUELTO') AS ventas_aliases,
      (SELECT count(*) FROM producto_aliases_v01 WHERE fuente='notas_venta_raw' AND nivel='VERSION' AND estado='RESUELTO') AS notas_aliases,
      (SELECT jsonb_object_agg(s.fuente,jsonb_build_object(
          'total_sku',s.total_sku,
          'resolved_sku',coalesce(r.resolved_sku,0),
          'unresolved_sku',s.total_sku-coalesce(r.resolved_sku,0)
        )) FROM sku_counts s LEFT JOIN resolved_counts r USING (fuente)) AS sku_coverage,
      (SELECT count(*) FROM conflicts) AS aliases_resueltos_ambiguos
  `);

  return summary[0];
}
