import { customGptDb } from '../custom-gpt/db.js';
import { buildCurrentMtdTransfer } from './buildCurrentMtdTransfer.js';
import { buildHistoricalTransfer } from './buildHistoricalTransfer.js';
import { rankTransfers } from './rankTransfers.js';
import { parseTransferInput } from './transferInput.js';
import {
  currentMtdRanges, fetchPreliminarySnapshotInventory, fetchTransferRows, historicalQueryRange,
} from './transferQuery.js';
import { validateTransfer } from './validateTransfer.js';
import { selectPreliminarySnapshot } from '../rvm-universe/selectPreliminarySnapshot.js';

function authority(parsed) {
  if (parsed.mode === 'HISTORICAL' && parsed.subjectEntity.level === 'CIDEF_TOTAL') {
    return {
      subjectAuthority: 'brand_aggregate_organization_bucket',
      detailAuthority: 'organization_bucket[raw_brand_norm=DFM]',
      semantics: 'DFM_PLUS_ZNA_BY_CERTIFIED_VALIDITY',
    };
  }
  return {
    subjectAuthority: 'organization_bucket[raw_brand_norm=DFM]',
    detailAuthority: 'organization_bucket[raw_brand_norm=DFM]',
    semantics: 'DFM_ONLY',
  };
}

function warningsFor(built, parsed) {
  const warnings = ['NO_CAUSAL_TRANSFER_INFERENCE'];
  if (built.coverage.brand_origin_unresolved_units > 0) warnings.push('BRAND_ORIGIN_UNRESOLVED_PRESENT');
  if (built.coverage.model_identity_unresolved_units > 0) warnings.push('MODEL_IDENTITY_UNRESOLVED_PRESENT');
  if (built.detail.some((row) => row.subject_growth_status === 'ZERO_BASE'
    || row.competitor_growth_status === 'ZERO_BASE'
    || row.market_mtd_growth_status === 'ZERO_BASE'
    || row.chinese_market_mtd_growth_status === 'ZERO_BASE')) warnings.push('ZERO_BASE');
  if (built.coverage.subject_units_observed === 0) {
    warnings.push('SUBJECT_NOT_DFM_RVM');
  }
  if (parsed.comparisonScope === 'MODEL_COMPARABLE_SET') warnings.push('OBSERVED_RELATION_SET_LIMITATION');
  if (parsed.temporalBasis === 'ROLLING_12') warnings.push('ROLLING_12_PERSISTENCE_NOT_APPLICABLE');
  if (parsed.mode === 'CURRENT_MTD') warnings.push('CURRENT_MTD_PRELIMINARY');
  return [...new Set(warnings)];
}

function subjectOutput(parsed) {
  return {
    level: parsed.subjectEntity.level,
    ...(parsed.subjectEntity.brandId == null ? {} : { brand_id: parsed.subjectEntity.brandId }),
    ...(parsed.subjectEntity.modelId == null ? {} : { model_id: parsed.subjectEntity.modelId }),
  };
}

function policy(parsed) {
  return {
    evidence: 'CANDIDATE_COMPETITIVE_COUNTERPART',
    causal_inference: 'NO_CAUSAL_TRANSFER_INFERENCE',
    share_denominator: 'same RVM period × comparison_scope × data_status × cutoff',
    persistence: parsed.temporalBasis === 'ROLLING_12' ? 'NOT_APPLICABLE' : 'OBSERVED_PERIOD_RATIO_WITHOUT_HIDDEN_THRESHOLDS',
    ranking: `${parsed.ranking}_INDEPENDENT_NO_COMPOSITE_SCORE`,
    ...(parsed.comparisonScope === 'MODEL_COMPARABLE_SET'
      ? { comparable_set: 'OBSERVED_RELATION_SET' } : {}),
  };
}

function periodOutput(parsed) {
  if (parsed.mode === 'HISTORICAL') return { date_from: parsed.dateFrom, date_to: parsed.dateTo };
  const ranges = currentMtdRanges(parsed.dateCutoff);
  const currentDays = Number(parsed.dateCutoff.slice(8, 10));
  const comparisonDays = Number(ranges.comparison.dateTo.slice(8, 10));
  return {
    date_cutoff: parsed.dateCutoff,
    effective_cutoff_date: parsed.dateCutoff,
    current_date_from: ranges.current.dateFrom,
    current_date_to: ranges.current.dateTo,
    comparable_date_from: ranges.comparison.dateFrom,
    comparable_date_to: ranges.comparison.dateTo,
    current_days_observed: currentDays,
    comparison_days_observed: comparisonDays,
  };
}

function projection(summaries, parsed) {
  const losing = summaries.filter((row) => row.target_gain_peer_loss_periods > 0);
  const gaining = summaries.filter((row) => row.target_loss_peer_gain_periods > 0);
  const rankedLosing = rankTransfers(losing, parsed.ranking, parsed.offset, parsed.limit);
  const rankedGaining = rankTransfers(gaining, parsed.ranking, parsed.offset, parsed.limit);
  return {
    peers_losing_when_subject_gains: rankedLosing,
    peers_gaining_when_subject_loses: rankedGaining,
    selectedKeys: new Set([...rankedLosing, ...rankedGaining].map((row) => row.competitor_entity.key)),
    page: {
      offset: parsed.offset,
      limit: parsed.limit,
      ranking: parsed.ranking,
      eligible_losing_peers: losing.length,
      eligible_gaining_peers: gaining.length,
    },
  };
}

function unevaluable(parsed, warning, inventory = []) {
  return {
    engine: 'competitive_share_transfer_v01',
    version: '0.1',
    status: 'NOT_EVALUABLE',
    mode: parsed.mode,
    subject_entity: subjectOutput(parsed),
    comparison_scope: parsed.comparisonScope,
    competitor_level: parsed.competitorLevel,
    temporal_basis: parsed.temporalBasis,
    authority: authority(parsed),
    policy: policy(parsed),
    period: parsed.mode === 'CURRENT_MTD'
      ? { ...periodOutput(parsed), effective_cutoff_date: null } : periodOutput(parsed),
    data_status: parsed.mode === 'CURRENT_MTD'
      ? { current: 'PRELIMINARY', comparison: 'CONSOLIDATED' }
      : { current: 'CONSOLIDATED', comparison: 'CONSOLIDATED' },
    snapshot_date: null,
    snapshot_inventory: inventory,
    detail: [],
    peers_losing_when_subject_gains: [],
    peers_gaining_when_subject_loses: [],
    warnings: [warning, 'NO_CAUSAL_TRANSFER_INFERENCE'],
    interpretation: 'CANDIDATE_COMPETITIVE_COUNTERPART',
  };
}

export async function buildCompetitiveShareTransfer(input = {}, dependencies = {}) {
  const parsedBase = parseTransferInput(input);
  const parsed = { ...parsedBase, ...authority(parsedBase) };
  const query = dependencies.query || customGptDb().query;
  let built;
  let snapshotCount = null;
  let snapshotDate = null;

  if (parsed.mode === 'HISTORICAL') {
    const range = historicalQueryRange(parsed);
    const rows = await fetchTransferRows({ ...range, dataStatus: 'CONSOLIDATED' }, query);
    built = buildHistoricalTransfer(rows, parsed);
  } else {
    const ranges = currentMtdRanges(parsed.dateCutoff);
    const inventory = await fetchPreliminarySnapshotInventory(
      ranges.current.dateFrom, ranges.current.dateTo, query,
    );
    snapshotCount = inventory.length;
    const selection = selectPreliminarySnapshot(inventory, {
      dateFrom: ranges.current.dateFrom,
      cutoffDate: parsed.dateCutoff,
    });
    if (!selection.selected) return unevaluable(parsed, selection.warning, inventory);
    const { selected } = selection;
    snapshotDate = selected.snapshot_date;
    const [currentRows, comparisonRows] = await Promise.all([
      fetchTransferRows({ ...ranges.current, dataStatus: 'PRELIMINARY', snapshotDate }, query),
      fetchTransferRows({ ...ranges.comparison, dataStatus: 'CONSOLIDATED' }, query),
    ]);
    built = buildCurrentMtdTransfer(currentRows, comparisonRows, parsed, snapshotDate);
  }

  const ranked = projection(built.summaries, parsed);
  const warnings = warningsFor(built, parsed);
  const validation = validateTransfer({ detail: built.detail, parsed, snapshotCount, coverage: built.coverage });
  return {
    engine: 'competitive_share_transfer_v01',
    version: '0.1',
    status: validation.ok ? (warnings.length > 1 ? 'WARNING' : 'EVALUABLE') : 'NOT_EVALUABLE',
    mode: parsed.mode,
    subject_entity: subjectOutput(parsed),
    comparison_scope: parsed.comparisonScope,
    competitor_level: parsed.competitorLevel,
    temporal_basis: parsed.temporalBasis,
    authority: authority(parsed),
    policy: policy(parsed),
    period: periodOutput(parsed),
    data_status: parsed.mode === 'HISTORICAL'
      ? { current: 'CONSOLIDATED', comparison: 'CONSOLIDATED' }
      : { current: 'PRELIMINARY', comparison: 'CONSOLIDATED' },
    snapshot_date: snapshotDate,
    detail: built.detail.filter((row) => ranked.selectedKeys.has(row.competitor_entity.key)),
    peers_losing_when_subject_gains: ranked.peers_losing_when_subject_gains,
    peers_gaining_when_subject_loses: ranked.peers_gaining_when_subject_loses,
    page: ranked.page,
    coverage: built.coverage,
    validation,
    warnings,
    interpretation: 'CANDIDATE_COMPETITIVE_COUNTERPART',
  };
}
