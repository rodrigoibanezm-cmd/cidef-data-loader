import { identityCtes } from './identityCtes.js';
import { UNIVERSE_CTES } from './universeCtes.js';

function geographyClause(scope, params) {
  if (!scope.geography) return '';
  params.push(scope.geography.values);
  const position = params.length;
  const column = scope.geography.column;
  return ` AND master_norm(r.${column}) = ANY(ARRAY(SELECT master_norm(g.value) FROM unnest($${position}::text[]) AS g(value)))`;
}

export function buildCompetitiveQuery(scope) {
  const params = [scope.targetModelIds, scope.dateFrom, scope.dateTo];
  const geo = geographyClause(scope, params);
  const sql = `WITH
${identityCtes(geo)},
${UNIVERSE_CTES},
validation AS (
  SELECT count(*)::bigint AS raw_rows, coalesce(sum(cantidad),0)::numeric AS raw_units,
    count(*) FILTER (WHERE identity_status='RESUELTO')::bigint AS resolved_rows,
    coalesce(sum(cantidad) FILTER (WHERE identity_status='RESUELTO'),0)::numeric AS resolved_units,
    count(*) FILTER (WHERE identity_status='AMBIGUO')::bigint AS ambiguous_rows,
    coalesce(sum(cantidad) FILTER (WHERE identity_status='AMBIGUO'),0)::numeric AS ambiguous_units,
    count(*) FILTER (WHERE identity_status='NO_RESUELTO')::bigint AS unresolved_rows,
    coalesce(sum(cantidad) FILTER (WHERE identity_status='NO_RESUELTO'),0)::numeric AS unresolved_units,
    count(*) FILTER (WHERE resolution_method='CONTEXTUAL')::bigint AS contextual_rows,
    count(*) FILTER (WHERE cantidad<0)::bigint AS negative_quantity_rows,
    coalesce(sum(cantidad) FILTER (WHERE cantidad<0),0)::numeric AS negative_quantity_units,
    count(*) FILTER (WHERE cantidad IS DISTINCT FROM 1)::bigint AS quantity_not_one_rows
  FROM identity_resolution
),
reconciliation AS (
  SELECT coalesce((SELECT sum(units) FROM universe_model_units),0)::numeric AS model_units,
    coalesce((SELECT sum(i.cantidad) FROM identity_resolution i JOIN universe_keys u
      ON i.segment_key IS NOT DISTINCT FROM u.segment_key
      AND i.type_key IS NOT DISTINCT FROM u.type_key
      AND i.fuel_key IS NOT DISTINCT FROM u.fuel_key),0)::numeric AS source_units
)
SELECT
  coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.modelo_id) FROM targets t),'[]'::jsonb) AS targets,
  coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.target_model_id,o.target_units DESC)
    FROM target_observations o),'[]'::jsonb) AS target_observations,
  coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.segment_key,r.type_key,r.fuel_key,r.rank)
    FROM ranked_models r),'[]'::jsonb) AS ranked_models,
  coalesce((SELECT jsonb_agg(x.model_id ORDER BY x.model_id) FROM requested_targets x
    WHERE NOT EXISTS (SELECT 1 FROM targets t WHERE t.modelo_id=x.model_id)),'[]'::jsonb) AS missing_target_ids,
  to_jsonb(v) || jsonb_build_object('universe_source_units',q.source_units,
    'universe_model_units',q.model_units,'universe_reconciled',q.source_units=q.model_units) AS validation
FROM validation v CROSS JOIN reconciliation q;`;
  return { sql, params };
}
