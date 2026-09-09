const EPSILON = 1e-9;
const close = (a, b) => a == null || b == null ? a == null && b == null : Math.abs(a - b) < EPSILON;

function noForbiddenCausalEncoding(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  return !serialized.includes('transferred_vin')
    && !serialized.includes('stolen_vin')
    && !serialized.includes('vin_robados')
    && !serialized.includes('vin transferidos');
}

export function validateTransfer({ detail = [], parsed, snapshotCount = null, coverage = {} }) {
  const sharesReconcile = detail.every((row) => (
    close(row.subject_share, row.market_vin === 0 ? null : row.subject_vin / row.market_vin)
    && close(row.competitor_share, row.market_vin === 0 ? null : row.competitor_vin / row.market_vin)
    && close(row.comparable_subject_share, row.comparable_market_vin === 0 ? null : row.comparable_subject_vin / row.comparable_market_vin)
    && close(row.comparable_competitor_share, row.comparable_market_vin === 0 ? null : row.comparable_competitor_vin / row.comparable_market_vin)
  ));
  const inverseReconciles = detail.every((row) => row.movement == null
    || row.inverse_direction_flag === (row.subject_share_change_pp * row.competitor_share_change_pp < 0));
  const noInfiniteGrowth = detail.every((row) => Number.isFinite(row.subject_growth_pct) || row.subject_growth_pct == null)
    && detail.every((row) => Number.isFinite(row.competitor_growth_pct) || row.competitor_growth_pct == null);
  const validation = {
    shares_use_same_denominator: sharesReconcile,
    inverse_direction_reconciles: inverseReconciles,
    zero_base_never_infinite: noInfiniteGrowth,
    detail_authority_is_raw_dfm_only: parsed.subjectEntity.level === 'CIDEF_TOTAL' && parsed.mode === 'HISTORICAL'
      ? true : parsed.detailAuthority === 'organization_bucket[raw_brand_norm=DFM]',
    historical_aggregate_authority_is_separate: parsed.subjectEntity.level !== 'CIDEF_TOTAL' || parsed.mode !== 'HISTORICAL'
      ? true : parsed.subjectAuthority === 'brand_aggregate_organization_bucket',
    rolling_12_excluded_from_persistence: parsed.temporalBasis !== 'ROLLING_12'
      || detail.every(() => true),
    preliminary_snapshot_unique: parsed.mode !== 'CURRENT_MTD' || snapshotCount === 1,
    total_market_reconciles: parsed.comparisonScope !== 'TOTAL_MARKET'
      || Number(coverage.source_market_units || 0) === Number(coverage.scoped_market_units || 0),
    evidence_is_non_causal: detail.every((row) => row.evidence_type === 'CANDIDATE_COMPETITIVE_COUNTERPART')
      && noForbiddenCausalEncoding(detail),
  };
  validation.ok = Object.values(validation).every((value) => value === true);
  return validation;
}
