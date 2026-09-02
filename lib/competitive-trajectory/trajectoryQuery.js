import { identityCtes } from '../competitive/identityCtes.js';

function geographyClause(scope, params) {
  if (!scope.geography) return '';
  params.push(scope.geography.values);
  const position = params.length;
  return ` AND master_norm(r.${scope.geography.column}) = ANY(ARRAY(
    SELECT master_norm(g.value) FROM unnest($${position}::text[]) AS g(value)
  ))`;
}

export function buildTrajectoryQuery(scope) {
  const params = [scope.targetModelIds, scope.dateFrom, scope.dateTo];
  const geo = geographyClause(scope, params);
  const sql = `WITH
${identityCtes(geo)},
target_universe_keys AS (
  SELECT i.segment_key, i.type_key, i.fuel_key,
    min(i.descripcion_segmento) AS segment,
    min(i.descripcion_tipo) AS type,
    min(i.combustible) AS fuel,
    array_agg(DISTINCT i.model_id ORDER BY i.model_id) AS target_model_ids
  FROM identity_resolution i
  JOIN targets t ON t.modelo_id=i.model_id
  GROUP BY i.segment_key,i.type_key,i.fuel_key
),
monthly_model_units AS (
  SELECT to_char(date_trunc('month',i.fecha),'YYYY-MM') AS month,
    u.segment_key,u.type_key,u.fuel_key,u.segment,u.type,u.fuel,u.target_model_ids,
    CASE WHEN i.model_id IS NOT NULL THEN 'MODEL:'||i.model_id
      ELSE 'RAW:'||coalesce(i.raw_brand_norm,'')||'|'||coalesce(i.raw_model_norm,'') END AS entity_key,
    i.model_id,
    CASE WHEN i.model_id IS NOT NULL THEN 'RESUELTO'
      WHEN bool_or(i.identity_status='AMBIGUO') THEN 'AMBIGUO' ELSE 'NO_RESUELTO' END AS identity_status,
    min(i.marca) AS rvm_brand,min(i.modelo_homologado) AS rvm_model,
    sum(coalesce(i.cantidad,0))::numeric AS units,count(*)::bigint AS row_count
  FROM identity_resolution i
  JOIN target_universe_keys u ON i.segment_key IS NOT DISTINCT FROM u.segment_key
    AND i.type_key IS NOT DISTINCT FROM u.type_key
    AND i.fuel_key IS NOT DISTINCT FROM u.fuel_key
  GROUP BY date_trunc('month',i.fecha),u.segment_key,u.type_key,u.fuel_key,
    u.segment,u.type,u.fuel,u.target_model_ids,
    CASE WHEN i.model_id IS NOT NULL THEN 'MODEL:'||i.model_id
      ELSE 'RAW:'||coalesce(i.raw_brand_norm,'')||'|'||coalesce(i.raw_model_norm,'') END,
    i.model_id
),
model_labeled AS (
  SELECT b.*,coalesce(ma.nombre_canonico,b.rvm_brand) AS brand,
    coalesce(m.nombre_canonico,b.rvm_model) AS model
  FROM monthly_model_units b
  LEFT JOIN modelos_master_v01 m ON m.modelo_id=b.model_id
  LEFT JOIN marcas_master_v01 ma ON ma.marca_id=m.marca_id
)
SELECT * FROM model_labeled
ORDER BY month,segment_key,type_key,fuel_key,units DESC,brand,model,entity_key;`;
  return { sql, params };
}
