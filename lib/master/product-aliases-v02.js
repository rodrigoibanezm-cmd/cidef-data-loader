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

// No VIN-correlated lookup here. The known S50/MAGE EV historical anomaly is
// preserved as ambiguity instead of being globally collapsed during this pass.
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
    AND master_norm(r.modeo_version) LIKE '%S50 EV%' THEN 'S50 EV'
  WHEN master_norm(r.marca)='FOTON'
    AND master_norm(r.modelo_homologado)='FOTON G7'
    AND master_norm(r.modeo_version) LIKE '%EV%' THEN 'G7 EV'
  WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='FOTON G7' THEN 'G7'
  WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='VIEW' THEN 'VIEW GRAND'
  WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='FOTON FURGON FT' THEN 'FT'
  ELSE master_norm(r.modelo_homologado)
END`;

async function expandByCommercialName(source, table, skuColumn, brandColumn) {
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
    ), normalized AS (
      SELECT master_norm(sku) sku_norm,
             ${BRAND_CANON} marca_norm,
             master_norm(nombre) nombre_norm
      FROM observed_names
    ), deterministic_names AS (
      SELECT sku_norm,
             min(marca_norm) marca_norm,
             min(nombre_norm) nombre_norm,
             count(*) evidence_n
      FROM normalized
      WHERE marca_norm IS NOT NULL AND nombre_norm IS NOT NULL
      GROUP BY sku_norm
      HAVING count(DISTINCT marca_norm)=1
         AND count(DISTINCT nombre_norm)=1
    ), candidates AS (
      SELECT n.sku_norm,ma.marca_id,mo.modelo_id,ve.version_id,n.evidence_n
      FROM deterministic_names n
      JOIN marcas_master_v01 ma ON ma.nombre_normalizado=n.marca_norm
      JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id
      JOIN versiones_master_v01 ve ON ve.modelo_id=mo.modelo_id
      WHERE n.nombre_norm=ve.nombre_normalizado
         OR strpos(n.nombre_norm,ve.nombre_normalizado)>0
         OR strpos(ve.nombre_normalizado,n.nombre_norm)>0
    ), resolved AS (
      SELECT sku_norm,min(marca_id) marca_id,min(modelo_id) modelo_id,
             min(version_id) version_id,sum(evidence_n) evidence_count
      FROM candidates
      GROUP BY sku_norm
      HAVING count(DISTINCT version_id)=1
    ), source_values AS (
      SELECT master_norm(${skuColumn}) sku_norm,
             min(trim(${skuColumn})) valor_raw,
             min(trim(${brandColumn})) contexto_marca_raw
      FROM ${table}
      WHERE master_norm(${skuColumn}) IS NOT NULL
      GROUP BY master_norm(${skuColumn})
    )
    INSERT INTO producto_aliases_v01(
      nivel,fuente,valor_raw,valor_normalizado,contexto_marca_raw,
      marca_id,modelo_id,version_id,evidencia_tipo,evidencia_count,estado
    )
    SELECT 'VERSION',$1,s.valor_raw,s.sku_norm,s.contexto_marca_raw,
           r.marca_id,r.modelo_id,r.version_id,
           'SKU_NOMBRE_COMERCIAL_CONTENIDO_V02',greatest(1,r.evidence_count),'RESUELTO'
    FROM source_values s
    JOIN resolved r USING (sku_norm)
    ON CONFLICT DO NOTHING
  `;
  await queryDb(sql, [source]);
}

async function expandByRvmVin(source, table, skuColumn, brandColumn, vinColumn) {
  const sql = `
    WITH source_vins AS (
      SELECT DISTINCT master_norm(t.${skuColumn}) sku_norm,
             upper(trim(t.${vinColumn})) vin_norm
      FROM ${table} t
      WHERE master_norm(t.${skuColumn}) IS NOT NULL
        AND nullif(trim(t.${vinColumn}),'') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM producto_aliases_v01 a
          WHERE a.fuente=$1 AND a.nivel='VERSION' AND a.estado='RESUELTO'
            AND a.valor_normalizado=master_norm(t.${skuColumn})
        )
    ), rvm_observed AS (
      SELECT s.sku_norm,
             ${RVM_BRAND_CANON} marca_norm,
             ${RVM_MODEL_CANON} modelo_norm,
             master_norm(r.modeo_version) version_norm,
             count(*) evidence_n
      FROM source_vins s
      JOIN rvm_raw r ON upper(trim(r.vin))=s.vin_norm
      WHERE master_norm(r.modelo_homologado) IS NOT NULL
      GROUP BY s.sku_norm,${RVM_BRAND_CANON},${RVM_MODEL_CANON},master_norm(r.modeo_version)
    ), version_candidates AS (
      SELECT ro.sku_norm,ma.marca_id,mo.modelo_id,ve.version_id,ro.evidence_n
      FROM rvm_observed ro
      JOIN marcas_master_v01 ma ON ma.nombre_normalizado=ro.marca_norm
      JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id AND mo.nombre_normalizado=ro.modelo_norm
      JOIN versiones_master_v01 ve ON ve.modelo_id=mo.modelo_id
      WHERE ro.version_norm IS NOT NULL
        AND (ro.version_norm=ve.nombre_normalizado
          OR strpos(ro.version_norm,ve.nombre_normalizado)>0
          OR strpos(ve.nombre_normalizado,ro.version_norm)>0)
    ), model_unique AS (
      SELECT ro.sku_norm,min(ma.marca_id) marca_id,min(mo.modelo_id) modelo_id,
             sum(ro.evidence_n) evidence_n
      FROM rvm_observed ro
      JOIN marcas_master_v01 ma ON ma.nombre_normalizado=ro.marca_norm
      JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id AND mo.nombre_normalizado=ro.modelo_norm
      GROUP BY ro.sku_norm
      HAVING count(DISTINCT mo.modelo_id)=1
    ), single_version_models AS (
      SELECT modelo_id,min(version_id) version_id
      FROM versiones_master_v01
      GROUP BY modelo_id
      HAVING count(*)=1
    ), all_candidates AS (
      SELECT sku_norm,marca_id,modelo_id,version_id,evidence_n FROM version_candidates
      UNION ALL
      SELECT m.sku_norm,m.marca_id,m.modelo_id,s.version_id,m.evidence_n
      FROM model_unique m JOIN single_version_models s USING(modelo_id)
    ), resolved AS (
      SELECT sku_norm,min(marca_id) marca_id,min(modelo_id) modelo_id,
             min(version_id) version_id,sum(evidence_n) evidence_count
      FROM all_candidates
      GROUP BY sku_norm
      HAVING count(DISTINCT version_id)=1
    ), source_values AS (
      SELECT master_norm(${skuColumn}) sku_norm,
             min(trim(${skuColumn})) valor_raw,
             min(trim(${brandColumn})) contexto_marca_raw
      FROM ${table}
      WHERE master_norm(${skuColumn}) IS NOT NULL
      GROUP BY master_norm(${skuColumn})
    )
    INSERT INTO producto_aliases_v01(
      nivel,fuente,valor_raw,valor_normalizado,contexto_marca_raw,
      marca_id,modelo_id,version_id,evidencia_tipo,evidencia_count,estado
    )
    SELECT 'VERSION',$1,s.valor_raw,s.sku_norm,s.contexto_marca_raw,
           r.marca_id,r.modelo_id,r.version_id,
           'SKU_VIN_RVM_CONSENSO_V02',greatest(1,r.evidence_count),'RESUELTO'
    FROM source_values s
    JOIN resolved r USING(sku_norm)
    ON CONFLICT DO NOTHING
  `;
  await queryDb(sql, [source]);
}

async function summary() {
  const rows = await queryDb(`
    WITH sku_counts AS (
      SELECT 'vehiculos_raw' fuente,count(DISTINCT master_norm(modelo)) FILTER(WHERE master_norm(modelo) IS NOT NULL) total_sku FROM vehiculos_raw
      UNION ALL
      SELECT 'ventas_raw',count(DISTINCT master_norm(articulo)) FILTER(WHERE master_norm(articulo) IS NOT NULL) FROM ventas_raw
      UNION ALL
      SELECT 'notas_venta_raw',count(DISTINCT master_norm(modelo)) FILTER(WHERE master_norm(modelo) IS NOT NULL) FROM notas_venta_raw
    ), resolved_counts AS (
      SELECT fuente,count(DISTINCT valor_normalizado) resolved_sku
      FROM producto_aliases_v01
      WHERE nivel='VERSION' AND estado='RESUELTO'
        AND fuente IN ('vehiculos_raw','ventas_raw','notas_venta_raw')
      GROUP BY fuente
    ), conflicts AS (
      SELECT fuente,nivel,valor_normalizado,coalesce(contexto_marca_raw,'') cm,coalesce(contexto_modelo_raw,'') cmo
      FROM producto_aliases_v01 WHERE estado='RESUELTO'
      GROUP BY 1,2,3,4,5
      HAVING count(DISTINCT coalesce(version_id,modelo_id,marca_id))>1
    )
    SELECT
      (SELECT count(*) FROM producto_aliases_v01) aliases_total,
      (SELECT jsonb_object_agg(s.fuente,jsonb_build_object(
        'total_sku',s.total_sku,'resolved_sku',coalesce(r.resolved_sku,0),
        'unresolved_sku',s.total_sku-coalesce(r.resolved_sku,0)))
       FROM sku_counts s LEFT JOIN resolved_counts r USING(fuente)) sku_coverage,
      (SELECT count(*) FROM conflicts) aliases_resueltos_ambiguos
  `);
  return rows[0];
}

export async function refreshProductAliasesV02() {
  await refreshProductAliasesV01();
  await expandByCommercialName('ventas_raw','ventas_raw','articulo','desc_mae_marca');
  await expandByCommercialName('notas_venta_raw','notas_venta_raw','modelo','desc_mae_marca');
  await expandByCommercialName('vehiculos_raw','vehiculos_raw','modelo','marca');
  return summary();
}

export async function refreshProductAliasesV02Ventas() {
  await expandByRvmVin('ventas_raw','ventas_raw','articulo','desc_mae_marca','nro_vin_chasis');
  return summary();
}

export async function refreshProductAliasesV02Notas() {
  await expandByRvmVin('notas_venta_raw','notas_venta_raw','modelo','desc_mae_marca','chasis');
  return summary();
}

export async function refreshProductAliasesV02Vehiculos() {
  await expandByRvmVin('vehiculos_raw','vehiculos_raw','modelo','marca','vin_chasis');
  return summary();
}

export async function refreshProductAliasesV02Summary() {
  return summary();
}
