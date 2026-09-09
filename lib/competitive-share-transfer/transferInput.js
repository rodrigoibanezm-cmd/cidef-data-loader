import { normalizeEnum, semanticError, validDate } from '../longitudinal/common.js';

const MODES = new Set(['HISTORICAL', 'CURRENT_MTD']);
const SUBJECT_LEVELS = new Set(['CIDEF_TOTAL', 'BRAND', 'MODEL']);
const SCOPES = new Set(['TOTAL_MARKET', 'CHINESE_MARKET', 'MODEL_COMPARABLE_SET']);
const COMPETITOR_LEVELS = new Set(['BRAND', 'MODEL']);
const TEMPORAL_BASES = new Set(['MONTHLY_YOY', 'QUARTER_YOY', 'CALENDAR_YEAR_YOY', 'ROLLING_12']);
const RANKINGS = new Set(['CONSISTENCY', 'SHARE_MAGNITUDE', 'VIN_MAGNITUDE', 'CURRENT_MTD']);

function positiveId(value, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw semanticError(code);
  return parsed;
}

function optionalNumber(value, { code, integer = false, min = 0, max = null } = {}) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isSafeInteger(parsed))
    || parsed < min || (max != null && parsed > max)) throw semanticError(code);
  return parsed;
}

function subject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw semanticError('SUBJECT_ENTITY_REQUIRED');
  const level = normalizeEnum(value.level, SUBJECT_LEVELS, 'INVALID_SUBJECT_LEVEL');
  const brandId = level === 'BRAND' ? positiveId(value.brand_id, 'SUBJECT_BRAND_ID_REQUIRED') : null;
  const modelId = level === 'MODEL' ? positiveId(value.model_id, 'SUBJECT_MODEL_ID_REQUIRED') : null;
  return { level, brandId, modelId };
}

function isHistoricalBoundary(dateFrom, dateTo, basis) {
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T00:00:00.000Z`);
  const endDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate();
  if (basis === 'CALENDAR_YEAR_YOY') {
    return from.getUTCMonth() === 0 && from.getUTCDate() === 1
      && to.getUTCMonth() === 11 && to.getUTCDate() === 31;
  }
  if (basis === 'QUARTER_YOY') {
    return from.getUTCMonth() % 3 === 0 && from.getUTCDate() === 1
      && to.getUTCMonth() % 3 === 2 && to.getUTCDate() === endDay;
  }
  return from.getUTCDate() === 1 && to.getUTCDate() === endDay;
}

export function parseTransferInput(input = {}) {
  const mode = normalizeEnum(input.mode, MODES, 'INVALID_TRANSFER_MODE');
  const subjectEntity = subject(input.subject_entity);
  const comparisonScope = normalizeEnum(input.comparison_scope, SCOPES, 'INVALID_COMPARISON_SCOPE');
  const competitorLevel = normalizeEnum(input.competitor_level, COMPETITOR_LEVELS, 'INVALID_COMPETITOR_LEVEL');
  const temporalBasis = normalizeEnum(input.temporal_basis, TEMPORAL_BASES, 'INVALID_TEMPORAL_BASIS', 'MONTHLY_YOY');
  const ranking = normalizeEnum(input.ranking, RANKINGS, 'INVALID_TRANSFER_RANKING', mode === 'CURRENT_MTD' ? 'CURRENT_MTD' : 'CONSISTENCY');
  if (comparisonScope === 'MODEL_COMPARABLE_SET'
    && (subjectEntity.level !== 'MODEL' || competitorLevel !== 'MODEL')) {
    throw semanticError('MODEL_COMPARABLE_SET_REQUIRES_MODEL_LEVELS');
  }
  if (mode === 'CURRENT_MTD' && temporalBasis !== 'MONTHLY_YOY') {
    throw semanticError('CURRENT_MTD_REQUIRES_MONTHLY_YOY');
  }
  if (mode === 'CURRENT_MTD' && ranking !== 'CURRENT_MTD') {
    throw semanticError('CURRENT_MTD_REQUIRES_CURRENT_MTD_RANKING');
  }
  if (mode === 'HISTORICAL' && ranking === 'CURRENT_MTD') {
    throw semanticError('CURRENT_MTD_RANKING_REQUIRES_CURRENT_MTD_MODE');
  }

  let dateFrom = null;
  let dateTo = null;
  let dateCutoff = null;
  if (mode === 'HISTORICAL') {
    dateFrom = String(input.date_from || '');
    dateTo = String(input.date_to || '');
    if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
      throw semanticError('INVALID_DATE_RANGE');
    }
    if (!isHistoricalBoundary(dateFrom, dateTo, temporalBasis)) {
      throw semanticError('HISTORICAL_REQUIRES_COMPLETE_PERIODS');
    }
  } else {
    dateCutoff = String(input.date_cutoff || '');
    if (!validDate(dateCutoff)) throw semanticError('DATE_CUTOFF_REQUIRED');
  }

  const persistenceMinPeriods = optionalNumber(input.persistence_min_periods, {
    code: 'INVALID_PERSISTENCE_MIN_PERIODS', integer: true, min: 1,
  });
  const persistenceMinRatio = optionalNumber(input.persistence_min_ratio, {
    code: 'INVALID_PERSISTENCE_MIN_RATIO', min: 0, max: 1,
  });
  if ((persistenceMinPeriods == null) !== (persistenceMinRatio == null)) {
    throw semanticError('PERSISTENCE_PARAMETERS_MUST_BE_PROVIDED_TOGETHER');
  }

  return {
    mode, subjectEntity, comparisonScope, competitorLevel, temporalBasis,
    dateFrom, dateTo, dateCutoff, persistenceMinPeriods, persistenceMinRatio, ranking,
    limit: optionalNumber(input.limit, { code: 'INVALID_LIMIT', integer: true, min: 1, max: 100 }) ?? 20,
    offset: optionalNumber(input.offset, { code: 'INVALID_OFFSET', integer: true, min: 0 }) ?? 0,
  };
}
