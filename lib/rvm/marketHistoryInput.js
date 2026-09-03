import { comparePeriods, normalizePeriod, parseTimeGrain } from './periods.js';

const BREAKDOWNS = new Set(['SEGMENT', 'TYPE', 'FUEL', 'BRAND', 'MODEL', 'REGION', 'COMUNA']);
const GEO_COLUMNS = Object.freeze({ REGION: 'region', COMUNA: 'comuna_adquisicion' });

function cleanOptional(value) {
  if (value == null || value === '') return null;
  return String(value).trim();
}

function parseGeography(value) {
  if (value == null) return null;
  const level = String(value.level || '').toUpperCase();
  if (!GEO_COLUMNS[level]) throw new Error('INVALID_UNIVERSE_DIMENSION');
  if (!Array.isArray(value.values) || value.values.length === 0 || value.values.length > 100) throw new Error('INVALID_UNIVERSE_DIMENSION');
  const values = [...new Set(value.values.map((item) => String(item).trim()).filter(Boolean))];
  if (!values.length) throw new Error('INVALID_UNIVERSE_DIMENSION');
  return { level, column: GEO_COLUMNS[level], values };
}

function parseUniverse(value) {
  const input = value ?? {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_UNIVERSE_DIMENSION');
  const allowed = new Set(['segment', 'type', 'fuel', 'geography']);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error('INVALID_UNIVERSE_DIMENSION');
  return {
    segment: cleanOptional(input.segment),
    type: cleanOptional(input.type),
    fuel: cleanOptional(input.fuel),
    geography: parseGeography(input.geography),
  };
}

export function parseMarketHistoryInput(input = {}) {
  const hasSingle = input.period != null;
  const hasPair = input.period_a != null || input.period_b != null;
  if (hasSingle === hasPair || (hasPair && (!input.period_a || !input.period_b))) throw new Error('INVALID_PERIOD');
  const periods = hasSingle
    ? [{ id: 'period', ...normalizePeriod(input.period) }]
    : [{ id: 'period_a', ...normalizePeriod(input.period_a) }, { id: 'period_b', ...normalizePeriod(input.period_b) }];
  const breakdown = input.breakdown == null ? null : String(input.breakdown).toUpperCase();
  if (breakdown && !BREAKDOWNS.has(breakdown)) throw new Error('INVALID_UNIVERSE_DIMENSION');
  return {
    periods,
    timeGrain: parseTimeGrain(input.time_grain),
    universe: parseUniverse(input.universe_definition),
    breakdown,
    comparability: periods.length === 2 ? comparePeriods(periods[0], periods[1]) : null,
  };
}
