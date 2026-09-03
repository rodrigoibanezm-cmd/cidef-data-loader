import { rvmIdentityResolutionCte, rvmModelAliasCtes } from '../rvm/rvmIdentitySql.js';

export function identityCtes(geographyClause = '') {
  return `
requested_targets AS (
  SELECT unnest($1::bigint[]) AS model_id
),
targets AS (
  SELECT DISTINCT m.modelo_id, m.marca_id, ma.nombre_canonico AS brand, m.nombre_canonico AS model
  FROM requested_targets t
  JOIN producto_portafolio_v01 p ON p.modelo_id=t.model_id
    AND p.organizacion='CIDEF' AND p.vigente=true
  JOIN modelos_master_v01 m ON m.modelo_id=p.modelo_id
  JOIN marcas_master_v01 ma ON ma.marca_id=m.marca_id
),
${rvmModelAliasCtes()},
rvm_scoped AS MATERIALIZED (
  SELECT r.*,
    master_norm(r.marca) AS raw_brand_norm,
    master_norm(r.modelo_homologado) AS raw_model_norm,
    master_norm(r.modeo_version) AS raw_version_norm,
    master_norm(r.descripcion_segmento) AS segment_key,
    master_norm(r.descripcion_tipo) AS type_key,
    master_norm(r.combustible) AS fuel_key
  FROM rvm_raw r
  WHERE r.fecha BETWEEN $2::date AND $3::date${geographyClause}
),
${rvmIdentityResolutionCte({ sourceCte: 'rvm_scoped' })}`;
}
