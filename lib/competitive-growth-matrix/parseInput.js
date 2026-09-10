import { normalizeEnum, semanticError, validDate } from '../longitudinal/common.js';

export const COMPARISON_SCOPES = new Set(['TOTAL_MARKET', 'CHINESE_MARKET', 'BRAND', 'MODEL']);
export const TEMPORAL_COMPARISONS = new Set([
  'YOY_MONTH', 'ROLLING_12_YOY', 'MOM', 'CALENDAR_YEAR_YOY', 'YTD_YOY',
]);
export const RANKING_METRICS = new Set([
  'GROWTH_DIFFERENTIAL_PP', 'CIDEF_GROWTH_ABS', 'CIDEF_GROWTH_PCT',
]);

function list(value, allowed, code, fallback = null) {
  const source = value == null ? fallback : value;
  if (!Array.isArray(source) || source.length === 0) throw semanticError(code);
  return [...new Set(source.map((item) => normalizeEnum(item, allowed, code)))];
}

function ids(value, code) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw semanticError(code);
  const parsed = value.map(Number);
  if (parsed.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw semanticError(code);
  return [...new Set(parsed)].sort((a, b) => a - b);
}

function rankings(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw semanticError('INVALID_RANKINGS');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw semanticError('INVALID_RANKING');
    const unsupported = Object.keys(item).find((key) => !['metric', 'direction', 'limit'].includes(key));
    if (unsupported) throw semanticError('UNSUPPORTED_RANKING_FIELD', unsupported);
    const metric = normalizeEnum(item.metric, RANKING_METRICS, 'INVALID_RANKING_METRIC');
    const direction = normalizeEnum(item.direction, new Set(['ASC', 'DESC']), 'INVALID_RANKING_DIRECTION');
    const limit = Number(item.limit ?? 10);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw semanticError('INVALID_RANKING_LIMIT');
    return { metric, direction, limit };
  });
}

function monthEnd(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
    .toISOString().slice(0, 10);
}

export function parseGrowthMatrixInput(input = {}) {
  const allowedFields = new Set([
    'date_from', 'date_to', 'comparison_scopes', 'temporal_comparisons',
    'include_current_mtd', 'cutoff_date', 'brand_ids', 'model_ids', 'rankings',
  ]);
  const unsupported = Object.keys(input).find((key) => !allowedFields.has(key));
  if (unsupported) throw semanticError('UNSUPPORTED_GROWTH_MATRIX_FIELD', unsupported);
  const dateFrom = String(input.date_from || '');
  const dateTo = String(input.date_to || '');
  if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
    throw semanticError('INVALID_DATE_RANGE');
  }
  const comparisonScopes = list(input.comparison_scopes, COMPARISON_SCOPES, 'INVALID_COMPARISON_SCOPES');
  const temporalComparisons = list(
    input.temporal_comparisons,
    TEMPORAL_COMPARISONS,
    'INVALID_TEMPORAL_COMPARISONS',
    ['YOY_MONTH', 'ROLLING_12_YOY'],
  );
  const monthly = temporalComparisons.some((value) => ['YOY_MONTH', 'ROLLING_12_YOY', 'MOM'].includes(value));
  if (monthly && (dateFrom.slice(8, 10) !== '01' || dateTo !== monthEnd(dateTo))) {
    throw semanticError('MONTHLY_COMPARISON_REQUIRES_COMPLETE_PERIODS');
  }
  if (temporalComparisons.includes('CALENDAR_YEAR_YOY')
    && (dateFrom.slice(5) !== '01-01' || dateTo.slice(5) !== '12-31')) {
    throw semanticError('CALENDAR_YEAR_YOY_REQUIRES_COMPLETE_YEARS');
  }
  if (temporalComparisons.includes('YTD_YOY') && dateFrom !== `${dateTo.slice(0, 4)}-01-01`) {
    throw semanticError('YTD_YOY_REQUIRES_CURRENT_YEAR_START');
  }
  if (input.include_current_mtd != null && typeof input.include_current_mtd !== 'boolean') {
    throw semanticError('INVALID_INCLUDE_CURRENT_MTD');
  }
  const includeCurrentMtd = input.include_current_mtd === true;
  const cutoffDate = input.cutoff_date == null ? null : String(input.cutoff_date);
  if (includeCurrentMtd && !validDate(cutoffDate)) throw semanticError('CUTOFF_DATE_REQUIRED');
  if (!includeCurrentMtd && cutoffDate != null) throw semanticError('CUTOFF_DATE_REQUIRES_CURRENT_MTD');
  return {
    dateFrom,
    dateTo,
    comparisonScopes,
    temporalComparisons,
    includeCurrentMtd,
    cutoffDate,
    brandIds: ids(input.brand_ids, 'INVALID_BRAND_IDS'),
    modelIds: ids(input.model_ids, 'INVALID_MODEL_IDS'),
    rankings: rankings(input.rankings),
  };
}
