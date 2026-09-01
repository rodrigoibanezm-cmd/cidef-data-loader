export const UNIVERSE_CTES = `
target_observations_base AS (
  SELECT i.model_id AS target_model_id, i.segment_key, i.type_key, i.fuel_key,
    min(i.descripcion_segmento) AS segment, min(i.descripcion_tipo) AS type,
    min(i.combustible) AS fuel, sum(coalesce(i.cantidad,0))::numeric AS target_units
  FROM identity_resolution i
  JOIN targets t ON t.modelo_id=i.model_id
  GROUP BY i.model_id, i.segment_key, i.type_key, i.fuel_key
),
target_observations AS (
  SELECT b.*,
    CASE WHEN sum(target_units) OVER (PARTITION BY target_model_id)<>0
      THEN target_units / sum(target_units) OVER (PARTITION BY target_model_id) END AS target_universe_share
  FROM target_observations_base b
),
universe_keys AS (
  SELECT segment_key, type_key, fuel_key, min(segment) AS segment, min(type) AS type, min(fuel) AS fuel,
    array_agg(DISTINCT target_model_id ORDER BY target_model_id) AS target_model_ids
  FROM target_observations
  GROUP BY segment_key, type_key, fuel_key
),
universe_model_units AS (
  SELECT u.segment_key, u.type_key, u.fuel_key, u.segment, u.type, u.fuel, u.target_model_ids,
    CASE WHEN i.model_id IS NOT NULL THEN 'MODEL:'||i.model_id
      ELSE 'RAW:'||coalesce(i.raw_brand_norm,'')||'|'||coalesce(i.raw_model_norm,'') END AS entity_key,
    i.model_id,
    CASE WHEN i.model_id IS NOT NULL THEN 'RESUELTO'
      WHEN bool_or(i.identity_status='AMBIGUO') THEN 'AMBIGUO' ELSE 'NO_RESUELTO' END AS identity_status,
    min(i.marca) AS rvm_brand, min(i.modelo_homologado) AS rvm_model,
    sum(coalesce(i.cantidad,0))::numeric AS units, count(*)::bigint AS row_count
  FROM identity_resolution i
  JOIN universe_keys u ON i.segment_key IS NOT DISTINCT FROM u.segment_key
    AND i.type_key IS NOT DISTINCT FROM u.type_key AND i.fuel_key IS NOT DISTINCT FROM u.fuel_key
  GROUP BY u.segment_key,u.type_key,u.fuel_key,u.segment,u.type,u.fuel,u.target_model_ids,
    CASE WHEN i.model_id IS NOT NULL THEN 'MODEL:'||i.model_id
      ELSE 'RAW:'||coalesce(i.raw_brand_norm,'')||'|'||coalesce(i.raw_model_norm,'') END,
    i.model_id
),
model_labeled AS (
  SELECT b.*, coalesce(ma.nombre_canonico,b.rvm_brand) AS brand,
    coalesce(m.nombre_canonico,b.rvm_model) AS model
  FROM universe_model_units b
  LEFT JOIN modelos_master_v01 m ON m.modelo_id=b.model_id
  LEFT JOIN marcas_master_v01 ma ON ma.marca_id=m.marca_id
),
universe_totals AS (
  SELECT segment_key,type_key,fuel_key,sum(units)::numeric AS total_units,
    count(*)::bigint AS total_models, count(DISTINCT brand)::bigint AS total_brands
  FROM model_labeled GROUP BY segment_key,type_key,fuel_key
),
ranked_base AS (
  SELECT m.*, t.total_units,t.total_models,t.total_brands,
    row_number() OVER (PARTITION BY m.segment_key,m.type_key,m.fuel_key
      ORDER BY m.units DESC,m.brand,m.model,m.entity_key) AS rank,
    CASE WHEN t.total_units<>0 THEN m.units/t.total_units END AS share
  FROM model_labeled m
  JOIN universe_totals t USING (segment_key,type_key,fuel_key)
),
ranked_models AS (
  SELECT b.*,
    CASE WHEN total_units<>0 THEN sum(units) OVER (
      PARTITION BY segment_key,type_key,fuel_key
      ORDER BY units DESC,brand,model,entity_key ROWS UNBOUNDED PRECEDING
    )/total_units END AS cumulative_share
  FROM ranked_base b
)`;
