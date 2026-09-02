import { VENDEDOR_CIDEF_INTERVALS_SQL } from '../ventas-org/vendedorCidefSql.js';

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
), vendedor_cidef AS (
  ${VENDEDOR_CIDEF_INTERVALS_SQL}
), source AS (
  SELECT v.*,
         CASE
           WHEN split_part(v.fecha_factura::text, ' ', 1) ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
             THEN to_date(split_part(v.fecha_factura::text, ' ', 1), 'MM/DD/YYYY')
           WHEN split_part(v.fecha_factura::text, ' ', 1) ~ '^\\d{1,2}/\\d{1,2}/\\d{2}$'
             THEN to_date(split_part(v.fecha_factura::text, ' ', 1), 'MM/DD/YY')
           ELSE NULL
         END AS event_date
  FROM ventas_raw v
), classified AS (
  SELECT
    v.id_sucursal_vta::text AS store_key,
    v.nombre_usuario::text AS seller_key,
    COALESCE(s.match_count, 0) AS store_matches,
    COALESCE(p.match_count, 0) AS seller_matches,
    p.all_validated AS seller_validated,
    CASE WHEN p.match_count = 1 AND EXISTS (
      SELECT 1
      FROM vendedor_cidef vc
      WHERE vc.persona_id = p.persona_id
        AND v.event_date IS NOT NULL
        AND COALESCE(vc.valid_from, '-infinity'::date) <= v.event_date
        AND COALESCE(vc.valid_to, 'infinity'::date) >= v.event_date
        AND (vc.vigente OR vc.valid_from IS NOT NULL OR vc.valid_to IS NOT NULL)
    ) THEN TRUE ELSE FALSE END AS eligible_vendedor_cidef
  FROM source v
  LEFT JOIN store_map s ON s.id_sucursal_vta = v.id_sucursal_vta
  LEFT JOIN seller_map p ON p.usuario_canonico = v.nombre_usuario
)
SELECT
  COUNT(*)::int AS rows_total,
  COUNT(*) FILTER (WHERE store_matches = 1)::int AS rows_store_resolved,
  COUNT(*) FILTER (WHERE store_matches = 0)::int AS rows_store_unresolved,
  COUNT(*) FILTER (WHERE store_matches > 1)::int AS rows_store_ambiguous,
  COUNT(*) FILTER (WHERE seller_matches = 1)::int AS rows_seller_resolved,
  COUNT(*) FILTER (WHERE seller_matches = 1)::int AS resolved_person_identity,
  COUNT(*) FILTER (WHERE seller_matches = 1 AND eligible_vendedor_cidef)::int AS eligible_vendedor_cidef,
  COUNT(*) FILTER (WHERE seller_matches = 1 AND NOT eligible_vendedor_cidef)::int AS resolved_person_not_vendedor_cidef,
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
