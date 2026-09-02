import { customGptDb } from '../custom-gpt/db.js';

export async function loadSkuEvidence(sql = customGptDb()) {
  return sql.query(`
    WITH source_skus AS MATERIALIZED (
      SELECT DISTINCT master_norm(articulo) sku_norm, upper(trim(nro_vin_chasis)) vin_norm
      FROM ventas_raw
      WHERE master_norm(articulo) IS NOT NULL AND nullif(trim(nro_vin_chasis),'') IS NOT NULL
    ), source_values AS MATERIALIZED (
      SELECT master_norm(articulo) sku_norm, min(trim(articulo)) sku_raw,
        min(trim(desc_articulo)) desc_articulo, min(trim(desc_mae_marca)) marca_raw,
        count(*)::bigint raw_rows, count(DISTINCT master_norm(desc_articulo))::bigint distinct_descriptions,
        count(DISTINCT master_norm(desc_mae_marca))::bigint distinct_brands
      FROM ventas_raw WHERE master_norm(articulo) IS NOT NULL GROUP BY master_norm(articulo)
    ), canonical_by_vin AS MATERIALIZED (
      SELECT s.sku_norm,s.vin_norm,v.modelo_id
      FROM source_skus s JOIN vehiculo_canonico vc ON upper(trim(vc.vin))=s.vin_norm
      JOIN versiones_master_v01 v ON v.version_id=vc.version_id WHERE vc.version_id IS NOT NULL
    ), aliases_ranked AS MATERIALIZED (
      SELECT a.*,master_norm(a.contexto_marca_raw) brand_norm,master_norm(a.contexto_modelo_raw) model_norm,
        row_number() OVER(PARTITION BY a.valor_normalizado,master_norm(a.contexto_marca_raw),master_norm(a.contexto_modelo_raw)
          ORDER BY CASE a.estado WHEN 'RESUELTO' THEN 1 WHEN 'AMBIGUO' THEN 2 ELSE 3 END,a.alias_id) rn
      FROM producto_aliases_v01 a WHERE a.nivel='MODELO' AND a.fuente='rvm_raw'
    ), aliases AS MATERIALIZED (SELECT * FROM aliases_ranked WHERE rn=1),
    rvm_scoped AS MATERIALIZED (
      SELECT s.sku_norm,s.vin_norm,master_norm(r.marca) raw_brand_norm,
        master_norm(r.modelo_homologado) raw_model_norm,master_norm(r.modeo_version) raw_version_norm
      FROM source_skus s JOIN rvm_raw r ON upper(trim(r.vin))=s.vin_norm
    ), rvm_resolved AS MATERIALIZED (
      SELECT r.*,CASE WHEN coalesce(c.estado,g.estado)='RESUELTO' THEN coalesce(c.modelo_id,g.modelo_id) END modelo_id,
        CASE coalesce(c.estado,g.estado) WHEN 'RESUELTO' THEN 'RESUELTO' WHEN 'AMBIGUO' THEN 'AMBIGUO' ELSE 'NO_RESUELTO' END status
      FROM rvm_scoped r
      LEFT JOIN aliases c ON c.model_norm IS NOT NULL AND c.valor_normalizado=r.raw_model_norm
        AND c.brand_norm=r.raw_brand_norm AND c.model_norm=r.raw_version_norm
      LEFT JOIN aliases g ON c.alias_id IS NULL AND g.model_norm IS NULL
        AND g.valor_normalizado=r.raw_model_norm AND g.brand_norm=r.raw_brand_norm
    ), rvm_by_vin AS MATERIALIZED (
      SELECT sku_norm,vin_norm,count(DISTINCT modelo_id) FILTER(WHERE status='RESUELTO' AND modelo_id IS NOT NULL)::bigint model_n,
        min(modelo_id) FILTER(WHERE status='RESUELTO') modelo_id,
        count(*) FILTER(WHERE status='AMBIGUO')::bigint ambiguous_rows
      FROM rvm_resolved GROUP BY sku_norm,vin_norm
    ), effective AS MATERIALIZED (
      SELECT s.sku_norm,s.vin_norm,
        coalesce(c.modelo_id,CASE WHEN r.model_n=1 AND r.ambiguous_rows=0 THEN r.modelo_id END) modelo_id,
        CASE WHEN c.modelo_id IS NOT NULL THEN 'VEHICULO_CANONICO'
          WHEN r.model_n=1 AND r.ambiguous_rows=0 THEN 'RVM_EXACT_VIN'
          WHEN r.model_n>1 OR r.ambiguous_rows>0 THEN 'AMBIGUOUS_RVM_VIN' ELSE 'NO_EVIDENCE' END method,
        CASE WHEN c.modelo_id IS NOT NULL AND r.model_n=1 AND c.modelo_id<>r.modelo_id THEN 1 ELSE 0 END source_conflict
      FROM source_skus s LEFT JOIN canonical_by_vin c USING(sku_norm,vin_norm) LEFT JOIN rvm_by_vin r USING(sku_norm,vin_norm)
    ), per_sku AS (
      SELECT sku_norm,count(DISTINCT modelo_id) FILTER(WHERE modelo_id IS NOT NULL)::bigint distinct_model_ids,
        min(modelo_id) FILTER(WHERE modelo_id IS NOT NULL) modelo_id,count(*)::bigint observed_vins,
        count(*) FILTER(WHERE method='VEHICULO_CANONICO')::bigint canonical_vins,
        count(*) FILTER(WHERE method='RVM_EXACT_VIN')::bigint rvm_vins,
        count(*) FILTER(WHERE method='AMBIGUOUS_RVM_VIN')::bigint ambiguous_vins,
        count(*) FILTER(WHERE method='NO_EVIDENCE')::bigint no_evidence_vins,sum(source_conflict)::bigint source_conflict_vins
      FROM effective GROUP BY sku_norm
    )
    SELECT s.*,coalesce(p.distinct_model_ids,0) distinct_model_ids,p.modelo_id,
      coalesce(p.observed_vins,0) observed_vins,coalesce(p.canonical_vins,0) canonical_vins,
      coalesce(p.rvm_vins,0) rvm_vins,coalesce(p.ambiguous_vins,0) ambiguous_vins,
      coalesce(p.no_evidence_vins,0) no_evidence_vins,coalesce(p.source_conflict_vins,0) source_conflict_vins
    FROM source_values s LEFT JOIN per_sku p USING(sku_norm) ORDER BY s.sku_norm
  `);
}
