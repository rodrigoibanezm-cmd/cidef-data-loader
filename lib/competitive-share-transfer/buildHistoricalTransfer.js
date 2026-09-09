import { enumeratePeriods } from '../longitudinal/common.js';
import { MOVEMENT, persistenceFor, transferMetrics } from './transferMath.js';

const units = (row) => Number(row.units || 0);
const add = (map, key, value) => map.set(key, (map.get(key) || 0) + value);

function monthShift(month, amount) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function periodKey(month, temporalBasis) {
  if (temporalBasis === 'CALENDAR_YEAR_YOY') return month.slice(0, 4);
  if (temporalBasis === 'QUARTER_YOY') return `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`;
  return month;
}

function priorPeriod(period, temporalBasis) {
  if (temporalBasis === 'CALENDAR_YEAR_YOY') return String(Number(period) - 1);
  if (temporalBasis === 'QUARTER_YOY') return `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
  return monthShift(period, -12);
}

function subjectRow(row, parsed) {
  const detailIncluded = row.organization_bucket === 'INCLUDED' && row.raw_brand_norm === 'DFM';
  if (parsed.subjectEntity.level === 'CIDEF_TOTAL') {
    return parsed.mode === 'HISTORICAL'
      ? row.brand_aggregate_organization_bucket === 'INCLUDED'
      : detailIncluded;
  }
  if (!detailIncluded) return false;
  if (parsed.subjectEntity.level === 'BRAND') return Number(row.scope_brand_id) === parsed.subjectEntity.brandId;
  return Number(row.model_id) === parsed.subjectEntity.modelId;
}

function authorityCidefRow(row, parsed) {
  if (parsed.mode === 'HISTORICAL' && parsed.subjectEntity.level === 'CIDEF_TOTAL') {
    return row.brand_aggregate_organization_bucket === 'INCLUDED';
  }
  return row.organization_bucket === 'INCLUDED' && row.raw_brand_norm === 'DFM';
}

function comparableTuples(rows, parsed) {
  if (parsed.comparisonScope !== 'MODEL_COMPARABLE_SET') return null;
  return new Set(rows.filter((row) => subjectRow(row, parsed)).map((row) => {
    const base = JSON.stringify([row.segment_key, row.type_key, row.fuel_key]);
    return `${base}|${row.brand_origin_group || '*'}`;
  }));
}

function inScope(row, parsed, tuples) {
  if (parsed.comparisonScope === 'CHINESE_MARKET') return row.brand_origin_group === 'CHINESE';
  if (parsed.comparisonScope === 'MODEL_COMPARABLE_SET') {
    if (row.identity_status !== 'RESUELTO' || row.model_id == null) return false;
    if (parsed.subjectEntity.level === 'MODEL'
      && Number(row.model_id) === parsed.subjectEntity.modelId
      && row.raw_brand_norm !== 'DFM') return false;
    const base = JSON.stringify([row.segment_key, row.type_key, row.fuel_key]);
    return tuples.has(`${base}|*`) || tuples.has(`${base}|${row.brand_origin_group || '*'}`);
  }
  return true;
}

function competitor(row, parsed) {
  if (authorityCidefRow(row, parsed)) return null;
  if (parsed.competitorLevel === 'BRAND') {
    if (row.scope_brand_id == null) return null;
    return { key: `BRAND:${row.scope_brand_id}`, level: 'BRAND', brand_id: Number(row.scope_brand_id), model_id: null, brand: row.brand_name || row.raw_brand_norm, model: null };
  }
  if (row.identity_status !== 'RESUELTO' || row.model_id == null) return null;
  if (parsed.subjectEntity.level === 'MODEL'
    && Number(row.model_id) === parsed.subjectEntity.modelId) return null;
  return { key: `MODEL:${row.model_id}`, level: 'MODEL', brand_id: row.scope_brand_id == null ? null : Number(row.scope_brand_id), model_id: Number(row.model_id), brand: row.brand_name || row.raw_brand_norm, model: row.model_name };
}

function monthlyDataset(rows, parsed) {
  const tuples = comparableTuples(rows, parsed);
  const market = new Map();
  const subject = new Map();
  const peers = new Map();
  const meta = new Map();
  let originUnresolvedUnits = 0;
  let modelUnresolvedUnits = 0;
  let sourceUnits = 0;
  let scopedUnits = 0;
  let subjectUnits = 0;
  const protectedPeerKeys = new Set(rows.filter((row) => authorityCidefRow(row, parsed)).flatMap((row) => {
    if (parsed.competitorLevel === 'BRAND') return row.scope_brand_id == null ? [] : [`BRAND:${row.scope_brand_id}`];
    return row.model_id == null ? [] : [`MODEL:${row.model_id}`];
  }));
  for (const row of rows) {
    sourceUnits += units(row);
    if (row.brand_origin_group == null) originUnresolvedUnits += units(row);
    if (row.identity_status !== 'RESUELTO' || row.model_id == null) modelUnresolvedUnits += units(row);
    if (!inScope(row, parsed, tuples)) continue;
    scopedUnits += units(row);
    add(market, row.month, units(row));
    if (subjectRow(row, parsed)) {
      subjectUnits += units(row);
      add(subject, row.month, units(row));
    }
    const entity = competitor(row, parsed);
    if (entity && !protectedPeerKeys.has(entity.key)) {
      meta.set(entity.key, entity);
      if (!peers.has(entity.key)) peers.set(entity.key, new Map());
      add(peers.get(entity.key), row.month, units(row));
    }
  }
  return {
    market, subject, peers, meta, originUnresolvedUnits, modelUnresolvedUnits,
    sourceUnits, scopedUnits, subjectUnits,
  };
}

function requestedEvaluationPeriods(parsed) {
  const months = enumeratePeriods(parsed.dateFrom, parsed.dateTo, 'MONTH');
  return [...new Set(months.map((month) => periodKey(month, parsed.temporalBasis)))];
}

function aggregatePeriod(monthly, period, temporalBasis) {
  if (temporalBasis === 'MONTHLY_YOY') return monthly.get(period) || 0;
  if (temporalBasis === 'QUARTER_YOY') {
    const year = period.slice(0, 4);
    const start = (Number(period.at(-1)) - 1) * 3 + 1;
    return [0, 1, 2].reduce((sum, offset) => sum + (monthly.get(`${year}-${String(start + offset).padStart(2, '0')}`) || 0), 0);
  }
  if (temporalBasis === 'CALENDAR_YEAR_YOY') {
    return [...monthly.entries()].reduce((sum, [month, value]) => sum + (month.startsWith(`${period}-`) ? value : 0), 0);
  }
  return [...Array(12).keys()].reduce((sum, offset) => sum + (monthly.get(monthShift(period, -offset)) || 0), 0);
}

function valuesFor(monthly, period, parsed) {
  const current = aggregatePeriod(monthly, period, parsed.temporalBasis);
  const comparable = parsed.temporalBasis === 'ROLLING_12'
    ? [...Array(12).keys()].reduce((sum, offset) => sum + (monthly.get(monthShift(period, -12 - offset)) || 0), 0)
    : aggregatePeriod(monthly, priorPeriod(period, parsed.temporalBasis), parsed.temporalBasis);
  return { current, comparable };
}

function detailRows(dataset, parsed) {
  const periods = requestedEvaluationPeriods(parsed);
  const subjectEntity = {
    level: parsed.subjectEntity.level,
    key: parsed.subjectEntity.level === 'CIDEF_TOTAL' ? 'CIDEF_TOTAL'
      : parsed.subjectEntity.level === 'BRAND' ? `BRAND:${parsed.subjectEntity.brandId}` : `MODEL:${parsed.subjectEntity.modelId}`,
    ...(parsed.subjectEntity.brandId == null ? {} : { brand_id: parsed.subjectEntity.brandId }),
    ...(parsed.subjectEntity.modelId == null ? {} : { model_id: parsed.subjectEntity.modelId }),
  };
  const output = [];
  for (const [competitorKey, monthly] of dataset.peers) {
    for (const period of periods) {
      const subject = valuesFor(dataset.subject, period, parsed);
      const peer = valuesFor(monthly, period, parsed);
      const market = valuesFor(dataset.market, period, parsed);
      output.push({
        temporal_mode: parsed.mode,
        evaluation_period: period,
        comparable_period: parsed.temporalBasis === 'ROLLING_12' ? `${monthShift(period, -12)}_R12` : priorPeriod(period, parsed.temporalBasis),
        subject_entity: subjectEntity,
        competitor_entity: dataset.meta.get(competitorKey),
        comparison_scope: parsed.comparisonScope,
        competitor_level: parsed.competitorLevel,
        ...transferMetrics({
          subjectCurrent: subject.current, subjectComparable: subject.comparable,
          competitorCurrent: peer.current, competitorComparable: peer.comparable,
          marketCurrent: market.current, marketComparable: market.comparable,
        }),
        evidence_type: 'CANDIDATE_COMPETITIVE_COUNTERPART',
      });
    }
  }
  return output;
}

function summaryRows(detail, parsed) {
  const byPeer = new Map();
  for (const row of detail) {
    const key = row.competitor_entity.key;
    if (!byPeer.has(key)) byPeer.set(key, []);
    byPeer.get(key).push(row);
  }
  return [...byPeer.values()].map((rows) => {
    const ordered = rows.sort((a, b) => a.evaluation_period.localeCompare(b.evaluation_period));
    const evaluable = ordered.filter((row) => row.movement != null);
    const inverse = evaluable.filter((row) => row.inverse_direction_flag);
    const first = evaluable[0];
    const last = evaluable.at(-1);
    const persistence = parsed.temporalBasis === 'ROLLING_12'
      ? { periods_observed: evaluable.length, inverse_periods: null, inverse_consistency_ratio: null, persistence_status: 'NOT_APPLICABLE' }
      : persistenceFor(evaluable.length, inverse.length, parsed.persistenceMinPeriods, parsed.persistenceMinRatio);
    return {
      subject_entity: ordered[0].subject_entity,
      competitor_entity: ordered[0].competitor_entity,
      comparison_scope: parsed.comparisonScope,
      temporal_basis: parsed.temporalBasis,
      requested_period: { date_from: parsed.dateFrom, date_to: parsed.dateTo },
      ...persistence,
      target_gain_peer_loss_periods: evaluable.filter((row) => row.movement === MOVEMENT.TARGET_GAIN_PEER_LOSS).length,
      target_loss_peer_gain_periods: evaluable.filter((row) => row.movement === MOVEMENT.TARGET_LOSS_PEER_GAIN).length,
      inverse_share_change_magnitude: inverse.length ? Math.max(...inverse.map((row) => row.inverse_share_change_magnitude)) : 0,
      inverse_vin_change_magnitude: inverse.some((row) => row.inverse_vin_change_magnitude != null)
        ? Math.max(...inverse.map((row) => row.inverse_vin_change_magnitude).filter((value) => value != null)) : null,
      inverse_vin_occurrences: inverse.filter((row) => row.inverse_vin_change_magnitude != null).length,
      net_subject_share_change_pp: first && last ? 100 * (last.subject_share - first.subject_share) : null,
      net_competitor_share_change_pp: first && last ? 100 * (last.competitor_share - first.competitor_share) : null,
      evidence_type: 'CANDIDATE_COMPETITIVE_COUNTERPART',
    };
  });
}

export function buildHistoricalTransfer(rows, parsed) {
  const dataset = monthlyDataset(rows, parsed);
  const detail = detailRows(dataset, parsed);
  return {
    detail,
    summaries: summaryRows(detail, parsed),
    coverage: {
      brand_origin_unresolved_units: dataset.originUnresolvedUnits,
      model_identity_unresolved_units: dataset.modelUnresolvedUnits,
      source_market_units: dataset.sourceUnits,
      scoped_market_units: dataset.scopedUnits,
      scope_excluded_units: dataset.sourceUnits - dataset.scopedUnits,
      subject_units_observed: dataset.subjectUnits,
    },
  };
}

export { authorityCidefRow, competitor, inScope, monthlyDataset, subjectRow };
