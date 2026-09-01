export const IDENTITY_COVERAGE_SQL = `
WITH store_map AS (
  SELECT id_sucursal_vta, MIN(sucursal_id) AS sucursal_id, COUNT(*)::int AS match_count
  FROM sucursales_master
  GROUP BY id_sucursal_vta
), seller_map AS (
  SELECT usuario_canonico, MIN(persona_id) AS persona_id,
         COUNT(*)::int AS match_count, BOOL_AND(validated) AS all_validated
  FROM personas_master
  GROUP BY usuario_canonico
), classified AS (
  SELECT
    v.id_sucursal_vta::text AS store_key,
    v.nombre_usuario::text AS seller_key,
    COALESCE(s.match_count, 0) AS store_matches,
    COALESCE(p.match_count, 0) AS seller_matches,
    p.all_validated AS seller_validated
  FROM ventas_raw v
  LEFT JOIN store_map s ON s.id_sucursal_vta = v.id_sucursal_vta
  LEFT JOIN seller_map p ON p.usuario_canonico = v.nombre_usuario
)
SELECT
  COUNT(*)::int AS rows_total,
  COUNT(*) FILTER (WHERE store_matches = 1)::int AS rows_store_resolved,
  COUNT(*) FILTER (WHERE store_matches = 0)::int AS rows_store_unresolved,
  COUNT(*) FILTER (WHERE store_matches > 1)::int AS rows_store_ambiguous,
  COUNT(*) FILTER (WHERE seller_matches = 1)::int AS rows_seller_resolved,
  COUNT(*) FILTER (WHERE seller_matches = 0)::int AS rows_seller_unresolved,
  COUNT(*) FILTER (WHERE seller_matches > 1)::int AS rows_seller_ambiguous,
  COUNT(*) FILTER (WHERE store_matches = 1 AND seller_matches = 1)::int AS rows_both_resolved,
  COUNT(*) FILTER (WHERE seller_matches = 1 AND seller_validated IS FALSE)::int AS rows_seller_unvalidated,
  COUNT(DISTINCT store_key)::int AS distinct_store_keys,
  COUNT(DISTINCT seller_key)::int AS distinct_seller_keys,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT store_key) FILTER (WHERE store_matches = 0), NULL) AS store_unresolved,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT seller_key) FILTER (WHERE seller_matches = 0), NULL) AS seller_unresolved,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT store_key) FILTER (WHERE store_matches > 1), NULL) AS store_ambiguous,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT seller_key) FILTER (WHERE seller_matches > 1), NULL) AS seller_ambiguous
FROM classified;
`;
