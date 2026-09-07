const ORGANIZATION_SCOPES = new Set(['CIDEF', 'INDUMOTORA', 'MACO_TATTERSALL', 'ALL']);

export function parseOrganizationScope(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      const error = new Error('ORGANIZATION_SCOPE_REQUIRED');
      error.code = 'ORGANIZATION_SCOPE_REQUIRED';
      throw error;
    }
    return 'ALL';
  }
  const scope = String(value).trim().toUpperCase();
  if (!ORGANIZATION_SCOPES.has(scope)) {
    const error = new Error('INVALID_ORGANIZATION_SCOPE');
    error.code = 'INVALID_ORGANIZATION_SCOPE';
    throw error;
  }
  return scope;
}

export function rvmOrganizationResolutionCtes({ organizationScope, organizationParam = null, sourceCte = 'identity_resolution', outputCte = 'organization_resolution' } = {}) {
  const allScope = organizationScope === 'ALL';
  const selectedOrganization = allScope
    ? `selected_organization AS (SELECT NULL::bigint organization_id, 'ALL'::text organization_key)`
    : `selected_organization AS (SELECT organization_id,organization_key FROM organizations_master WHERE organization_key=${organizationParam}::text AND active)`;

  const statusSql = allScope
    ? `'INCLUDED'::text`
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
    : `CASE WHEN cm.organization_ids IS NOT NULL THEN 'CANONICAL_MODEL'
            WHEN hm.organization_ids IS NOT NULL THEN 'HISTORICAL_SOURCE_RULE'
            ELSE NULL END`;

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
${outputCte} AS MATERIALIZED (
  SELECT i.*,
         coalesce(i.brand_id,CASE WHEN hm.historical_brand_count=1 THEN hm.historical_brand_id END) scope_brand_id,
         coalesce(cm.organization_ids,hm.organization_ids) organization_ids,
         ${statusSql} organization_bucket,
         ${methodSql} organization_resolution_method
  FROM ${sourceCte} i
  LEFT JOIN canonical_organization_membership cm ON cm._rvm_scope_row_id=i._rvm_scope_row_id
  LEFT JOIN historical_organization_membership hm ON hm._rvm_scope_row_id=i._rvm_scope_row_id
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
