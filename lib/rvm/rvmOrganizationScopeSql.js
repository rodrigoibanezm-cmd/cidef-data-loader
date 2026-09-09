import { semanticError } from '../longitudinal/common.js';

const ORGANIZATION_SCOPES = new Set(['CIDEF', 'INDUMOTORA', 'MACO_TATTERSALL', 'ALL']);
export const CIDEF_RVM_DETAIL_RAW_BRAND = 'DFM';
export const CIDEF_RVM_HISTORICAL_AGGREGATION_SCOPE = 'BRAND_AGGREGATE';

export function parseOrganizationScope(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw semanticError('ORGANIZATION_SCOPE_REQUIRED');
    return 'ALL';
  }
  const scope = String(value).trim().toUpperCase();
  if (!ORGANIZATION_SCOPES.has(scope)) throw semanticError('INVALID_ORGANIZATION_SCOPE');
  return scope;
}

export function rvmOrganizationResolutionCtes({ organizationScope, organizationParam = null, sourceCte = 'identity_resolution', outputCte = 'organization_resolution' } = {}) {
  const allScope = organizationScope === 'ALL';
  const cidefScope = organizationScope === 'CIDEF';
  const selectedOrganization = allScope
    ? `selected_organization AS (SELECT NULL::bigint organization_id, 'ALL'::text organization_key)`
    : `selected_organization AS (SELECT organization_id,organization_key FROM organizations_master WHERE organization_key=${organizationParam}::text AND active)`;

  // CIDEF detail attribution is intentionally raw-source strict. Historical CIDEF
  // rules remain valid authority only for aggregate historical consumers and must
  // never grant model/product/detail inclusion here.
  const statusSql = allScope
    ? `'INCLUDED'::text`
    : cidefScope
      ? `CASE
          WHEN i.raw_brand_norm='${CIDEF_RVM_DETAIL_RAW_BRAND}' THEN 'INCLUDED'
          ELSE 'EXCLUDED_OTHER_ORGANIZATION'
        END`
      : `CASE
        WHEN coalesce(cm.organization_ids,hm.organization_ids) IS NOT NULL
          AND (SELECT organization_id FROM selected_organization) = ANY(coalesce(cm.organization_ids,hm.organization_ids))
          THEN 'INCLUDED'
        WHEN coalesce(cm.organization_ids,hm.organization_ids) IS NOT NULL
          THEN 'EXCLUDED_OTHER_ORGANIZATION'
        WHEN i.identity_status='AMBIGUO' THEN 'AMBIGUOUS'
        ELSE 'UNRESOLVED'
      END`;

  const methodSql = allScope
    ? `'ALL'::text`
    : cidefScope
      ? `CASE
          WHEN i.raw_brand_norm='${CIDEF_RVM_DETAIL_RAW_BRAND}' THEN 'RAW_BRAND_DFM'
          ELSE 'RAW_BRAND_EXCLUSION'
        END`
      : `CASE WHEN cm.organization_ids IS NOT NULL THEN 'CANONICAL_MODEL'
            WHEN hm.organization_ids IS NOT NULL THEN 'HISTORICAL_SOURCE_RULE'
            ELSE NULL END`;

  const organizationIdsSql = cidefScope
    ? `CASE
         WHEN i.raw_brand_norm='${CIDEF_RVM_DETAIL_RAW_BRAND}'
           THEN ARRAY[(SELECT organization_id FROM selected_organization)]::bigint[]
         ELSE NULL::bigint[]
       END`
    : `coalesce(cm.organization_ids,hm.organization_ids)`;

  const cidefHistoricalAggregateGuard = cidefScope
    ? `AND h.aggregation_scope='${CIDEF_RVM_HISTORICAL_AGGREGATION_SCOPE}'`
    : '';

  const aggregateBucketSql = allScope
    ? `'INCLUDED'::text`
    : `CASE
        WHEN ah.organization_ids IS NOT NULL
          AND (SELECT organization_id FROM selected_organization) = ANY(ah.organization_ids)
          THEN 'INCLUDED'
        WHEN ah.organization_ids IS NOT NULL THEN 'EXCLUDED_OTHER_ORGANIZATION'
        ELSE 'UNRESOLVED'
      END`;
  const aggregateMethodSql = allScope
    ? `'ALL'::text`
    : `CASE WHEN ah.organization_ids IS NOT NULL THEN 'HISTORICAL_BRAND_AGGREGATE'
            ELSE NULL END`;
  const brandAggregateCte = cidefScope
    ? `brand_aggregate_historical_membership AS MATERIALIZED (
  SELECT i._rvm_scope_row_id,
         array_agg(DISTINCT h.organization_id ORDER BY h.organization_id)::bigint[] organization_ids
  FROM ${sourceCte} i
  JOIN rvm_organization_historical_rule h
    ON h.certified
   AND h.source='rvm_raw'
   AND h.aggregation_scope='${CIDEF_RVM_HISTORICAL_AGGREGATION_SCOPE}'
   AND i.fecha>=h.valid_from
   AND (h.valid_to IS NULL OR i.fecha<=h.valid_to)
   AND (h.raw_brand IS NULL OR master_norm(h.raw_brand)=i.raw_brand_norm)
   AND (h.raw_model IS NULL OR master_norm(h.raw_model)=i.raw_model_norm)
   AND (h.raw_version IS NULL OR master_norm(h.raw_version)=i.raw_version_norm)
   AND (i.brand_id IS NULL OR h.brand_id=i.brand_id)
  GROUP BY i._rvm_scope_row_id
)`
    : `brand_aggregate_historical_membership AS MATERIALIZED (
  SELECT NULL::bigint AS _rvm_scope_row_id,NULL::bigint[] AS organization_ids WHERE false
)`;

  return `${selectedOrganization},
canonical_organization_membership AS MATERIALIZED (
  SELECT i._rvm_scope_row_id,
         array_agg(DISTINCT p.organization_id ORDER BY p.organization_id)::bigint[] organization_ids
  FROM ${sourceCte} i
  JOIN product_organization_membership p
    ON p.certified
   AND p.product_level='MODEL'
   AND p.product_id=i.model_id
   AND i.fecha>=p.valid_from
   AND (p.valid_to IS NULL OR i.fecha<=p.valid_to)
  WHERE i.identity_status='RESUELTO'
  GROUP BY i._rvm_scope_row_id
),
historical_organization_membership AS MATERIALIZED (
  SELECT i._rvm_scope_row_id,
         array_agg(DISTINCT h.organization_id ORDER BY h.organization_id)::bigint[] organization_ids,
         min(h.brand_id)::bigint historical_brand_id,
         count(DISTINCT h.brand_id)::int historical_brand_count
  FROM ${sourceCte} i
  JOIN rvm_organization_historical_rule h
    ON h.certified
   AND h.source='rvm_raw'
   ${cidefHistoricalAggregateGuard}
   AND i.fecha>=h.valid_from
   AND (h.valid_to IS NULL OR i.fecha<=h.valid_to)
   AND (h.raw_brand IS NULL OR master_norm(h.raw_brand)=i.raw_brand_norm)
   AND (h.raw_model IS NULL OR master_norm(h.raw_model)=i.raw_model_norm)
   AND (h.raw_version IS NULL OR master_norm(h.raw_version)=i.raw_version_norm)
   AND (i.brand_id IS NULL OR h.brand_id=i.brand_id)
  LEFT JOIN canonical_organization_membership cm ON cm._rvm_scope_row_id=i._rvm_scope_row_id
  WHERE cm._rvm_scope_row_id IS NULL
  GROUP BY i._rvm_scope_row_id
),
${brandAggregateCte},
${outputCte} AS MATERIALIZED (
  SELECT i.*,
         coalesce(i.brand_id,CASE WHEN hm.historical_brand_count=1 THEN hm.historical_brand_id END) scope_brand_id,
         ${organizationIdsSql} organization_ids,
         ${statusSql} organization_bucket,
         ${methodSql} organization_resolution_method,
         ${aggregateBucketSql} brand_aggregate_organization_bucket,
         ${aggregateMethodSql} brand_aggregate_resolution_method
  FROM ${sourceCte} i
  LEFT JOIN canonical_organization_membership cm ON cm._rvm_scope_row_id=i._rvm_scope_row_id
  LEFT JOIN historical_organization_membership hm ON hm._rvm_scope_row_id=i._rvm_scope_row_id
  LEFT JOIN brand_aggregate_historical_membership ah ON ah._rvm_scope_row_id=i._rvm_scope_row_id
)`;
}

export function organizationCoverageState({ total = 0, unresolved = 0, ambiguous = 0, organizationScope = 'ALL' } = {}) {
  if (organizationScope === 'ALL') return 'NOT_APPLICABLE';
  const t = Number(total || 0);
  const u = Number(unresolved || 0);
  const a = Number(ambiguous || 0);
  if (t === 0) return 'RESOLVED';
  if (a > 0) return 'AMBIGUOUS';
  if (u === t) return 'NO_COVERAGE';
  if (u > 0) return 'PARTIAL';
  return 'RESOLVED';
}
