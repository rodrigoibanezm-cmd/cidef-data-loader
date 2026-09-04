const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_GRAINS = new Set(['MONTH', 'YEAR']);

export function semanticError(code, detail = null) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

export function normalizeEnum(value, allowed, code, fallback = null) {
  const normalized = value == null || value === '' ? fallback : String(value).trim().toUpperCase();
  if (!normalized || !allowed.has(normalized)) throw semanticError(code, String(value ?? 'missing'));
  return normalized;
}

function validDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseDateRange(input = {}) {
  const dateFrom = String(input.date_from || '');
  const dateTo = String(input.date_to || '');
  if (!validDate(dateFrom) || !validDate(dateTo)) throw semanticError('INVALID_DATE_RANGE');
  if (dateFrom > dateTo) throw semanticError('INVALID_DATE_RANGE', 'date_from must be <= date_to');
  return { dateFrom, dateTo };
}

export function parseTimeGrain(value) {
  return normalizeEnum(value, TIME_GRAINS, 'INVALID_TIME_GRAIN', 'MONTH');
}

export function periodForDate(value, timeGrain) {
  const iso = String(value).slice(0, 10);
  return timeGrain === 'YEAR' ? iso.slice(0, 4) : iso.slice(0, 7);
}

export function enumeratePeriods(dateFrom, dateTo, timeGrain) {
  const periods = [];
  const cursor = new Date(`${dateFrom.slice(0, timeGrain === 'YEAR' ? 4 : 7)}${timeGrain === 'YEAR' ? '-01-01' : '-01'}T00:00:00.000Z`);
  const endPeriod = periodForDate(dateTo, timeGrain);
  while (periodForDate(cursor.toISOString(), timeGrain) <= endPeriod) {
    periods.push(periodForDate(cursor.toISOString(), timeGrain));
    if (timeGrain === 'YEAR') cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

export function withChanges(series, valueField = 'value') {
  return series.map((row, index) => {
    const current = row[valueField] == null ? null : Number(row[valueField]);
    const previous = index === 0 || series[index - 1][valueField] == null
      ? null : Number(series[index - 1][valueField]);
    return {
      ...row,
      absoluteChange: previous == null || current == null ? null : current - previous,
      pctChange: previous == null || current == null || previous === 0 ? null : (current - previous) / previous,
    };
  });
}

export function parseFilterObject(filters, supported) {
  if (filters == null) return {};
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw semanticError('INVALID_FILTER');
  const output = {};
  for (const [key, raw] of Object.entries(filters)) {
    if (!supported.has(key)) throw semanticError('UNSUPPORTED_FILTER', key);
    const values = Array.isArray(raw) ? raw : [raw];
    const cleaned = [...new Set(values.filter((value) => value != null && String(value).trim() !== '').map((value) => String(value).trim()))];
    if (!cleaned.length) throw semanticError('INVALID_FILTER', key);
    output[key] = cleaned;
  }
  return output;
}

export function filterMatches(value, accepted) {
  if (!accepted) return true;
  const normalized = value == null ? null : String(value).trim().toUpperCase();
  return accepted.some((candidate) => String(candidate).trim().toUpperCase() === normalized);
}

export function outputEnvelope({ motor, domain, parsed, series, seriesByBreakdown = null, metadata = {} }) {
  return {
    motor,
    version: '0.1',
    domain,
    metric: parsed.metric,
    grain: parsed.grain,
    timeGrain: parsed.timeGrain,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    filters: parsed.filters || {},
    series,
    breakdown: parsed.breakdown,
    ...(seriesByBreakdown ? { seriesByBreakdown } : {}),
    metadata: {
      persistence: 'NONE',
      execution: 'ON_DEMAND',
      interpretation: 'NONE',
      ...metadata,
    },
  };
}
