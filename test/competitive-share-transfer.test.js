import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCompetitiveShareTransfer } from '../lib/competitive-share-transfer/buildCompetitiveShareTransfer.js';
import { buildHistoricalTransfer, subjectRow } from '../lib/competitive-share-transfer/buildHistoricalTransfer.js';
import { buildCurrentMtdTransfer } from '../lib/competitive-share-transfer/buildCurrentMtdTransfer.js';
import { compareTransfers } from '../lib/competitive-share-transfer/rankTransfers.js';
import { parseTransferInput } from '../lib/competitive-share-transfer/transferInput.js';
import { buildTransferAggregateQuery } from '../lib/competitive-share-transfer/transferQuery.js';
import { transferMetrics } from '../lib/competitive-share-transfer/transferMath.js';

function parsed(extra = {}) {
  return parseTransferInput({
    mode: 'HISTORICAL', subject_entity: { level: 'CIDEF_TOTAL' },
    comparison_scope: 'TOTAL_MARKET', competitor_level: 'BRAND', temporal_basis: 'MONTHLY_YOY',
    date_from: '2025-01-01', date_to: '2025-02-28', ranking: 'CONSISTENCY', ...extra,
  });
}

function row(month, rawBrand, units, extra = {}) {
  const isDfm = rawBrand === 'DFM';
  return {
    month, raw_brand_norm: rawBrand, units, scope_brand_id: extra.brandId ?? (isDfm ? 1 : 2),
    brand_name: extra.brand ?? rawBrand, model_id: extra.modelId ?? (isDfm ? 10 : 20),
    model_name: extra.model ?? `${rawBrand} MODEL`, identity_status: extra.identityStatus ?? 'RESUELTO',
    organization_bucket: isDfm ? 'INCLUDED' : 'EXCLUDED_OTHER_ORGANIZATION',
    organization_resolution_method: isDfm ? 'RAW_BRAND_DFM' : 'RAW_BRAND_EXCLUSION',
    brand_aggregate_organization_bucket: extra.aggregateIncluded ? 'INCLUDED' : 'UNRESOLVED',
    brand_aggregate_resolution_method: extra.aggregateIncluded ? 'HISTORICAL_BRAND_AGGREGATE' : null,
    segment_key: 'SUV', type_key: 'SUV', fuel_key: 'GASOLINA',
    brand_origin_group: extra.originGroup === undefined ? 'CHINESE' : extra.originGroup,
    data_status: extra.dataStatus ?? 'CONSOLIDATED', snapshot_date: extra.snapshotDate ?? null,
  };
}

test('detail CIDEF is raw DFM only and aliases/memberships cannot expand it', () => {
  const detail = { ...parsed({ subject_entity: { level: 'MODEL', model_id: 10 }, competitor_level: 'MODEL' }), mode: 'HISTORICAL' };
  assert.equal(subjectRow(row('2025-01', 'DFM', 1, { modelId: 10 }), detail), true);
  for (const raw of ['DONGFENG', 'DONG FENG', 'DFSK', 'DFMSK', 'DFLM', 'ZNA']) {
    assert.equal(subjectRow(row('2025-01', raw, 1, { modelId: 10, aggregateIncluded: true }), detail), false, raw);
  }
});

test('historical CIDEF_TOTAL uses DFM plus ZNA only while certified aggregate rule is active', () => {
  const scope = { ...parsed(), subjectAuthority: 'brand_aggregate_organization_bucket' };
  const rows = [
    row('2024-01', 'DFM', 10, { aggregateIncluded: true }), row('2024-01', 'ZNA', 5, { aggregateIncluded: true, brandId: 3 }),
    row('2024-01', 'TOYOTA', 20, { brandId: 2, brand: 'TOYOTA', originGroup: 'NON_CHINESE' }),
    row('2025-01', 'DFM', 15, { aggregateIncluded: true }), row('2025-01', 'ZNA', 4, { aggregateIncluded: true, brandId: 3 }),
    row('2025-01', 'TOYOTA', 15, { brandId: 2, brand: 'TOYOTA', originGroup: 'NON_CHINESE' }),
    row('2025-02', 'ZNA', 7, { aggregateIncluded: false, brandId: 3 }),
  ];
  const result = buildHistoricalTransfer(rows, scope);
  const january = result.detail.find((item) => item.evaluation_period === '2025-01' && item.competitor_entity.key === 'BRAND:2');
  assert.equal(january.subject_vin, 19);
  assert.equal(january.comparable_subject_vin, 15);
  assert.equal(january.market_vin, 34);
  assert.equal(result.summaries.some((item) => item.competitor_entity.key === 'BRAND:3'), false, 'aggregate ZNA never leaks into peers');
  assert.equal(result.detail.find((item) => item.evaluation_period === '2025-02' && item.competitor_entity.key === 'BRAND:2').market_vin, 7, 'out-of-validity ZNA remains in TOTAL_MARKET');
});

test('MODEL_COMPARABLE_SET accepts only resolved exact observed structural tuples', () => {
  const scope = { ...parsed({ subject_entity: { level: 'MODEL', model_id: 10 }, comparison_scope: 'MODEL_COMPARABLE_SET', competitor_level: 'MODEL' }), mode: 'HISTORICAL' };
  const rows = [
    row('2024-01', 'DFM', 10, { modelId: 10 }), row('2025-01', 'DFM', 12, { modelId: 10 }),
    row('2024-01', 'TOYOTA', 10, { modelId: 20, brandId: 2 }), row('2025-01', 'TOYOTA', 8, { modelId: 20, brandId: 2 }),
    { ...row('2025-01', 'OTHER', 99, { modelId: 30, brandId: 3 }), segment_key: 'SEDAN' },
    row('2025-01', 'RAW', 50, { modelId: null, brandId: null, identityStatus: 'NO_RESUELTO' }),
    row('2025-01', 'ZNA', 40, { modelId: 10, brandId: 4, aggregateIncluded: true }),
  ];
  const result = buildHistoricalTransfer(rows, scope);
  assert.deepEqual([...new Set(result.detail.map((item) => item.competitor_entity.key))], ['MODEL:20']);
  assert.equal(result.detail.find((item) => item.evaluation_period === '2025-01').market_vin, 20);
});

test('CHINESE_MARKET is driven only by canonical origin_group and reports null-origin coverage', () => {
  const scope = { ...parsed({ comparison_scope: 'CHINESE_MARKET' }), mode: 'HISTORICAL' };
  const rows = [
    row('2024-01', 'DFM', 10, { aggregateIncluded: true }), row('2025-01', 'DFM', 12, { aggregateIncluded: true }),
    row('2025-01', 'TOYOTA', 100, { brandId: 2, originGroup: 'NON_CHINESE' }),
    row('2025-01', 'UNKNOWN', 50, { brandId: 3, originGroup: null }),
    row('2025-01', 'CHERY', 8, { brandId: 4, originGroup: 'CHINESE' }),
  ];
  const result = buildHistoricalTransfer(rows, scope);
  assert.equal(result.detail.find((item) => item.evaluation_period === '2025-01').market_vin, 20);
  assert.equal(result.coverage.brand_origin_unresolved_units, 50);
  assert.equal(result.coverage.scope_excluded_units, 150);
});

test('share, inverse movement and zero-base math are deterministic and non-infinite', () => {
  const result = transferMetrics({ subjectCurrent: 20, subjectComparable: 10, competitorCurrent: 5, competitorComparable: 10, marketCurrent: 50, marketComparable: 40 });
  assert.equal(result.movement, 'TARGET_GAIN_PEER_LOSS');
  assert.equal(result.inverse_direction_flag, true);
  assert.equal(result.inverse_share_change_magnitude, 15);
  assert.equal(result.inverse_vin_change_magnitude, 5);
  const zero = transferMetrics({ subjectCurrent: 1, subjectComparable: 0, competitorCurrent: 0, competitorComparable: 0, marketCurrent: 1, marketComparable: 0 });
  assert.equal(zero.subject_growth_pct, null);
  assert.equal(zero.subject_growth_status, 'ZERO_BASE');
});

test('current MTD uses DFM-only and SAME_DAY-shaped aliases with Chinese market context', () => {
  const scope = parseTransferInput({ mode: 'CURRENT_MTD', subject_entity: { level: 'CIDEF_TOTAL' }, comparison_scope: 'TOTAL_MARKET', competitor_level: 'BRAND', date_cutoff: '2026-09-09', ranking: 'CURRENT_MTD' });
  const current = [row('2026-09', 'DFM', 12, { dataStatus: 'PRELIMINARY', snapshotDate: '2026-09-09' }), row('2026-09', 'ZNA', 20, { brandId: 3 }), row('2026-09', 'TOYOTA', 8, { brandId: 2, originGroup: 'NON_CHINESE' })];
  const previous = [row('2025-09', 'DFM', 10), row('2025-09', 'ZNA', 30, { aggregateIncluded: true, brandId: 3 }), row('2025-09', 'TOYOTA', 10, { brandId: 2, originGroup: 'NON_CHINESE' })];
  const result = buildCurrentMtdTransfer(current, previous, scope, '2026-09-09');
  const peer = result.detail.find((item) => item.competitor_entity.key === 'BRAND:2');
  assert.equal(peer.current_mtd_subject_vin, 12);
  assert.equal(peer.comparable_mtd_subject_vin, 10);
  assert.equal(peer.current_days_observed, 9);
  assert.equal(peer.comparison_days_observed, 9);
  assert.equal(result.detail.some((item) => item.competitor_entity.key === 'BRAND:3'), true, 'TOTAL_MARKET keeps ZNA as peer in current detail');
});

test('query consumes certified universe with isolated status, snapshot and canonical brand origin', () => {
  const query = buildTransferAggregateQuery({ dateFrom: '2026-09-01', dateTo: '2026-09-09', dataStatus: 'PRELIMINARY', snapshotDate: '2026-09-09' });
  assert.match(query.sql, /r\.data_status=\$4::text/);
  assert.match(query.sql, /r\.snapshot_date=\$5::date/);
  assert.match(query.sql, /ma\.origin_group AS brand_origin_group/);
  assert.match(query.sql, /brand_aggregate_organization_bucket/);
  assert.doesNotMatch(query.sql, /pais_vin='CHINA'|pais_vin='CHINESE'/);
  assert.deepEqual(query.params.slice(2), ['CIDEF', 'PRELIMINARY', '2026-09-09']);
});

test('snapshot selection fails closed for none or multiple and never queries mixed detail', async () => {
  const input = { mode: 'CURRENT_MTD', subject_entity: { level: 'CIDEF_TOTAL' }, comparison_scope: 'TOTAL_MARKET', competitor_level: 'BRAND', date_cutoff: '2026-09-09', ranking: 'CURRENT_MTD' };
  for (const inventory of [[], [{ snapshot_date: '2026-09-08', min_date: '2026-09-01', max_date: '2026-09-08' }], [{ snapshot_date: '2026-09-08' }, { snapshot_date: '2026-09-09' }]]) {
    let calls = 0;
    const result = await buildCompetitiveShareTransfer(input, { query: async () => { calls += 1; return inventory; } });
    assert.equal(result.status, 'NOT_EVALUABLE');
    assert.equal(calls, 1);
    assert.ok(result.warnings.includes(inventory.length > 1 ? 'MULTIPLE_PRELIMINARY_SNAPSHOTS' : 'NO_VALID_PRELIMINARY_SNAPSHOT'));
  }
});

test('successful CURRENT_MTD executes one exact PRELIMINARY snapshot and one CONSOLIDATED SAME_DAY range', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (/GROUP BY snapshot_date/.test(sql)) return [{ snapshot_date: '2026-09-09', min_date: '2026-09-01', max_date: '2026-09-09' }];
    if (params.includes('PRELIMINARY')) return [row('2026-09', 'DFM', 12, { dataStatus: 'PRELIMINARY', snapshotDate: '2026-09-09' }), row('2026-09', 'TOYOTA', 8, { brandId: 2, originGroup: 'NON_CHINESE' })];
    return [row('2025-09', 'DFM', 10), row('2025-09', 'TOYOTA', 10, { brandId: 2, originGroup: 'NON_CHINESE' })];
  };
  const result = await buildCompetitiveShareTransfer({ mode: 'CURRENT_MTD', subject_entity: { level: 'CIDEF_TOTAL' }, comparison_scope: 'TOTAL_MARKET', competitor_level: 'BRAND', date_cutoff: '2026-09-09', ranking: 'CURRENT_MTD' }, { query });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].params.slice(2), ['CIDEF', 'PRELIMINARY', '2026-09-09']);
  assert.deepEqual(calls[2].params.slice(2), ['CIDEF', 'CONSOLIDATED']);
  assert.equal(result.validation.preliminary_snapshot_unique, true);
  assert.deepEqual(result.data_status, { current: 'PRELIMINARY', comparison: 'CONSOLIDATED' });
  assert.ok(result.warnings.includes('CURRENT_MTD_PRELIMINARY'));
  assert.ok(result.warnings.includes('NO_CAUSAL_TRANSFER_INFERENCE'));
});

test('ranking tie-breakers are independent and deterministic', () => {
  const base = { inverse_consistency_ratio: 0.5, inverse_periods: 2, periods_observed: 4, inverse_share_change_magnitude: 1, inverse_vin_change_magnitude: 2, inverse_vin_occurrences: 1, inverse_direction_flag: true };
  const a = { ...base, competitor_entity: { key: 'BRAND:A' } };
  const b = { ...base, competitor_entity: { key: 'BRAND:B' } };
  for (const ranking of ['CONSISTENCY', 'SHARE_MAGNITUDE', 'VIN_MAGNITUDE', 'CURRENT_MTD']) assert.ok(compareTransfers(a, b, ranking) < 0);
});

test('PERSISTENT is emitted only with explicit request thresholds', () => {
  const rows = [
    row('2024-01', 'DFM', 10, { aggregateIncluded: true }), row('2024-01', 'TOYOTA', 20, { brandId: 2 }),
    row('2024-02', 'DFM', 10, { aggregateIncluded: true }), row('2024-02', 'TOYOTA', 20, { brandId: 2 }),
    row('2025-01', 'DFM', 20, { aggregateIncluded: true }), row('2025-01', 'TOYOTA', 10, { brandId: 2 }),
    row('2025-02', 'DFM', 20, { aggregateIncluded: true }), row('2025-02', 'TOYOTA', 10, { brandId: 2 }),
  ];
  const descriptive = buildHistoricalTransfer(rows, { ...parsed(), mode: 'HISTORICAL' }).summaries[0];
  assert.equal(descriptive.persistence_status, 'REPEATED_OBSERVATION');
  const explicit = buildHistoricalTransfer(rows, { ...parsed({ persistence_min_periods: 2, persistence_min_ratio: 1 }), mode: 'HISTORICAL' }).summaries[0];
  assert.equal(explicit.persistence_status, 'PERSISTENT');
});

test('ROLLING_12 never classifies persistence and no production source encodes causal VIN transfer', async () => {
  const scope = { ...parsed({ temporal_basis: 'ROLLING_12', date_from: '2025-12-01', date_to: '2025-12-31' }), mode: 'HISTORICAL' };
  const rows = [row('2024-01', 'DFM', 1, { aggregateIncluded: true }), row('2025-12', 'TOYOTA', 1, { brandId: 2 })];
  const result = buildHistoricalTransfer(rows, scope);
  assert.ok(result.summaries.every((item) => item.persistence_status === 'NOT_APPLICABLE'));
  const sources = await Promise.all(['buildHistoricalTransfer.js','buildCurrentMtdTransfer.js','transferMath.js','rankTransfers.js'].map((name) => readFile(new URL(`../lib/competitive-share-transfer/${name}`, import.meta.url), 'utf8')));
  assert.equal(sources.some((source) => /transferred_vin|vin_robados|vin transferidos/i.test(source)), false);
});

test('capability query composes rvm_universe_v01 and never reconstructs RAW, aliases or MASTER', async () => {
  const source = await readFile(new URL('../lib/competitive-share-transfer/transferQuery.js', import.meta.url), 'utf8');
  assert.match(source, /buildRvmUniverseCtes/);
  assert.doesNotMatch(source, /FROM rvm_raw|producto_aliases_v01|modelos_master_v01|marcas_master_v01|product_organization_membership/);
});

test('input contract rejects invalid level, comparable-set, persistence and temporal combinations', () => {
  assert.throws(() => parsed({ subject_entity: { level: 'BRAND' } }), /SUBJECT_BRAND_ID_REQUIRED/);
  assert.throws(() => parsed({ comparison_scope: 'MODEL_COMPARABLE_SET' }), /MODEL_COMPARABLE_SET_REQUIRES_MODEL_LEVELS/);
  assert.throws(() => parsed({ persistence_min_periods: 2 }), /PERSISTENCE_PARAMETERS_MUST_BE_PROVIDED_TOGETHER/);
  assert.throws(() => parsed({ date_to: '2025-02-15' }), /HISTORICAL_REQUIRES_COMPLETE_PERIODS/);
  assert.throws(() => parseTransferInput({ mode: 'CURRENT_MTD', subject_entity: { level: 'CIDEF_TOTAL' }, comparison_scope: 'TOTAL_MARKET', competitor_level: 'BRAND', date_cutoff: '2026-09-09', temporal_basis: 'ROLLING_12' }), /CURRENT_MTD_REQUIRES_MONTHLY_YOY/);
});
