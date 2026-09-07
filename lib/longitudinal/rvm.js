import { buildRvmUniverse, RVM_UNIVERSE_FILTERS } from '../rvm-universe/buildRvmUniverse.js';
import { organizationCoverageState, parseOrganizationScope } from '../rvm/rvmOrganizationScopeSql.js';
import {
  buildTemporalSemantics, comparisonPosition, coverageRow, enumeratePeriods,
  identityWarnings, normalizeEnum, outputEnvelope, parseCutoff, parseDateRange,
  parseFilterObject, parseTimeGrain, periodForDate, semanticError,
  temporalWarnings, toIsoDate, withChanges,
} from './common.js';

export const ENGINE_NAME = 'rvm_longitudinal_context_v01';
const METRICS = new Set(['MARKET_SIZE', 'ENTITY_VIN', 'MARKET_SHARE', 'RANK']);
const GRAINS = new Set(['TOTAL', 'BRAND', 'MODEL', 'SEGMENT', 'TYPE', 'REGION', 'COMUNA', 'FUEL']);
const DIMENSIONS = RVM_UNIVERSE_FILTERS;
const BREAKDOWNS = new Set([...GRAINS].filter((value) => value !== 'TOTAL'));
const PRODUCT_SCOPE_KEYS = new Set(['brand_id', 'brand', 'model_id', 'model']);
const RANK_KEYS = Object.freeze({
  BRAND: ['brand_id', 'brand'], MODEL: ['model_id', 'model'], SEGMENT: ['segment'],
  TYPE: ['type'], REGION: ['region'], COMUNA: ['comuna'], FUEL: ['fuel'],
});

function usesProductScope(filters = {}, entity = {}) {
  return [...Object.keys(filters), ...Object.keys(entity)].some((key) => PRODUCT_SCOPE_KEYS.has(key));
}

export function parseRvmLongitudinalInput(input = {}) {
  const metric = normalizeEnum(input.metric, METRICS, 'INVALID_METRIC');
  const grain = normalizeEnum(input.grain, GRAINS, 'INVALID_GRAIN', 'TOTAL');
  const timeGrain = parseTimeGrain(input.time_grain);
  const filters = parseFilterObject(input.universe_filters ?? input.filters, DIMENSIONS);
  const entity = parseFilterObject(input.entity, DIMENSIONS);
  const breakdown = input.breakdown == null ? null : normalizeEnum(input.breakdown, BREAKDOWNS, 'INVALID_BREAKDOWN');
  if (['ENTITY_VIN', 'MARKET_SHARE', 'RANK'].includes(metric) && Object.keys(entity).length === 0) throw semanticError('ENTITY_REQUIRED');
  if (metric === 'MARKET_SIZE' && Object.keys(entity).length) throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'MARKET_SIZE does not accept entity');
  const organizationScope = parseOrganizationScope(input.organization_scope, { required: usesProductScope(filters, entity) });
  if (metric === 'MARKET_SIZE' && organizationScope !== 'ALL') {
    throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'MARKET_SIZE only supports organization_scope=ALL');
  }
  if (metric === 'RANK') {
    if (grain === 'TOTAL') throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'RANK requires a dimension grain');
    if (breakdown) throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'RANK does not support breakdown');
    if (!RANK_KEYS[grain].some((key) => entity[key]?.length === 1)) {
      throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', `RANK entity must identify one ${grain}`);
    }
  }
  return { metric, grain, timeGrain, filters, entity, breakdown, organizationScope, ...parseCutoff(input), ...parseDateRange(input) };
}

function masterNorm(value) {
  if (value == null) return null;
  const normalized = String(value).trim().replace(/\s+/g, ' ').toUpperCase();
  return normalized || null;
}

function eventValue(event, key) {
  return {
    brand_id: event.scope_brand_id,
    brand: event.brand_name,
    model_id: event.model_id,
    model: event.model_name,
    segment: event.descripcion_segmento,
    type: event.descripcion_tipo,
    region: event.region,
    comuna: event.comuna_adquisicion,
    fuel: event.combustible,
    origin: event.pais_vin,
  }[key];
}

function eventMatchesEntity(event, entity) {
  return Object.entries(entity).every(([key, accepted]) => {
    const value = eventValue(event, key);
    if (key.endsWith('_id')) return accepted.some((candidate) => String(candidate) === String(value));
    const normalized = masterNorm(value);
    return accepted.some((candidate) => masterNorm(candidate) === normalized);
  });
}

function dimension(event, grain) {
  if (grain === 'BRAND') {
    if (event.scope_brand_id != null) {
      return { key: String(event.scope_brand_id), label: event.brand_name, identityStatus: 'RESOLVED' };
    }
    const status = event.identity_status === 'AMBIGUO' ? 'AMBIGUOUS' : 'UNRESOLVED';
    return { key: status, label: status, identityStatus: status };
  }
  if (grain === 'MODEL') {
    if (event.identity_status === 'RESUELTO') {
      return { key: event.model_id == null ? null : String(event.model_id), label: event.model_name, identityStatus: 'RESOLVED' };
    }
    const status = event.identity_status === 'AMBIGUO' ? 'AMBIGUOUS' : 'UNRESOLVED';
    return { key: status, label: status, identityStatus: status };
  }
  const field = {
    SEGMENT: 'descripcion_segmento', TYPE: 'descripcion_tipo', REGION: 'region',
    COMUNA: 'comuna_adquisicion', FUEL: 'combustible',
  }[grain];
  const key = masterNorm(event[field]) ?? 'UNRESOLVED';
  const label = event[field] == null || String(event[field]).trim() === ''
    ? 'UNRESOLVED' : String(event[field]).trim();
  return { key, label, identityStatus: key === 'UNRESOLVED' ? 'UNRESOLVED' : 'RESOLVED' };
}

function sumUnits(events) {
  return events.reduce((sum, event) => sum + Number(event.cantidad || 0), 0);
}

function groupByPeriod(events, parsed) {
  const output = new Map(enumeratePeriods(parsed.dateFrom, parsed.dateTo, parsed.timeGrain)
    .map((period) => [period, 0]));
  for (const event of events) {
    const period = periodForDate(toIsoDate(event.fecha), parsed.timeGrain);
    output.set(period, (output.get(period) ?? 0) + Number(event.cantidad || 0));
  }
  return output;
}

function groupByDimension(events, grain, parsed) {
  const output = new Map();
  for (const event of events) {
    const bucket = dimension(event, grain);
    if (!output.has(bucket.key)) output.set(bucket.key, { ...bucket, events: [] });
    const current = output.get(bucket.key);
    if (bucket.label != null && (current.label == null || bucket.label < current.label)) current.label = bucket.label;
    current.events.push(event);
  }
  for (const bucket of output.values()) bucket.periods = groupByPeriod(bucket.events, parsed);
  return output;
}

function compareKeys(left, right) {
  if (left == null) return right == null ? 0 : 1;
  if (right == null) return -1;
  return String(left).localeCompare(String(right));
}

function rankByPeriod(events, parsed) {
  const periods = enumeratePeriods(parsed.dateFrom, parsed.dateTo, parsed.timeGrain);
  const candidates = groupByDimension(events, parsed.grain, parsed);
  const chosen = RANK_KEYS[parsed.grain].find((key) => parsed.entity[key]?.length === 1);
  const target = parsed.entity[chosen][0];
  const ranks = new Map(periods.map((period) => [period, null]));
  for (const period of periods) {
    const ranked = [...candidates.values()]
      .map((candidate) => ({ ...candidate, units: candidate.periods.get(period) || 0 }))
      .filter((candidate) => candidate.events.some((event) =>
        periodForDate(toIsoDate(event.fecha), parsed.timeGrain) === period))
      .sort((a, b) => b.units - a.units || compareKeys(a.key, b.key));
    const targetIndex = ranked.findIndex((candidate) => chosen.endsWith('_id')
      ? String(candidate.key) === String(target)
      : masterNorm(candidate.label) === masterNorm(target));
    if (targetIndex >= 0) ranks.set(period, targetIndex + 1);
  }
  return ranks;
}

function coverageFields(base, targetBase) {
  const identity = {
    resolved: sumUnits(base.filter((event) => event.identity_status === 'RESUELTO')),
    unresolved: sumUnits(base.filter((event) => event.identity_status === 'NO_RESUELTO')),
    ambiguous: sumUnits(base.filter((event) => event.identity_status === 'AMBIGUO')),
    total: sumUnits(base),
  };
  const organization = {
    included: sumUnits(targetBase.filter((event) => event.organization_bucket === 'INCLUDED')),
    excluded: sumUnits(targetBase.filter((event) => event.organization_bucket === 'EXCLUDED_OTHER_ORGANIZATION')),
    unresolved: sumUnits(targetBase.filter((event) => event.organization_bucket === 'UNRESOLVED')),
    ambiguous: sumUnits(targetBase.filter((event) => event.organization_bucket === 'AMBIGUOUS')),
    total: sumUnits(targetBase),
  };
  return { identity, organization };
}

function aggregateRows(base, entityBase, parsed, temporalSemantics, coverage, breakdown = null) {
  const periods = enumeratePeriods(parsed.dateFrom, parsed.dateTo, parsed.timeGrain);
  const totalDenominator = groupByPeriod(base, parsed);
  const totalNumerator = groupByPeriod(entityBase, parsed);
  const ranks = parsed.metric === 'RANK' ? rankByPeriod(
    base.filter((event) => event.organization_bucket === 'INCLUDED'), parsed,
  ) : null;
  const row = (period, rowType, bucketKey, bucketLabel, n, d) => ({
    period, row_type: rowType, bucket_key: bucketKey, bucket_label: bucketLabel,
    numerator: n, denominator: d,
    value: parsed.metric === 'MARKET_SIZE' ? d
      : parsed.metric === 'MARKET_SHARE' ? (d === 0 ? null : n / d)
        : parsed.metric === 'RANK' ? ranks.get(period) : n,
    last_observed_date: temporalSemantics.lastObservedDate,
    effective_date_to: temporalSemantics.effectiveDateTo,
    comparison_day: temporalSemantics.comparisonDay,
    identity_resolved: coverage.identity.resolved,
    identity_unresolved: coverage.identity.unresolved,
    identity_ambiguous: coverage.identity.ambiguous,
    identity_total: coverage.identity.total,
    organization_included: coverage.organization.included,
    organization_excluded: coverage.organization.excluded,
    organization_unresolved: coverage.organization.unresolved,
    organization_ambiguous: coverage.organization.ambiguous,
    organization_total: coverage.organization.total,
  });
  const rows = periods.map((period) => row(period, 'TOTAL', null, null,
    totalNumerator.get(period) || 0, totalDenominator.get(period) || 0));
  if (breakdown == null) return rows;

  const denominatorBuckets = groupByDimension(base, breakdown, parsed);
  const numeratorBuckets = groupByDimension(entityBase, breakdown, parsed);
  for (const bucket of [...denominatorBuckets.values()].sort((a, b) => compareKeys(a.key, b.key))) {
    const numeratorBucket = numeratorBuckets.get(bucket.key);
    for (const period of periods) {
      rows.push(row(period, 'BREAKDOWN', bucket.key, bucket.label,
        numeratorBucket?.periods.get(period) || 0, bucket.periods.get(period) || 0));
    }
  }
  return rows;
}

export function calculateRvmLongitudinal(universe, parsed) {
  if (universe?.universe !== 'rvm_universe_v01' || !Array.isArray(universe.analytical_events)) {
    throw new Error('rvm_universe_v01 analytical_events are required');
  }
  const temporalSemantics = buildTemporalSemantics(parsed, universe.period?.last_observed_date);
  const comparisonDay = temporalSemantics.comparisonDay ?? null;
  const base = universe.analytical_events.filter((event) => {
    const date = toIsoDate(event.fecha);
    if (!date || date < parsed.dateFrom || date > parsed.dateTo) return false;
    if (temporalSemantics.effectiveDateTo && date > temporalSemantics.effectiveDateTo) return false;
    return parsed.cutoffMode !== 'SAME_DAY' || comparisonDay == null
      || comparisonPosition(date, parsed.timeGrain) <= comparisonDay;
  });
  const targetBase = base.filter((event) => eventMatchesEntity(event, parsed.entity));
  const entityBase = parsed.organizationScope === 'ALL'
    ? targetBase
    : targetBase.filter((event) => event.organization_bucket === 'INCLUDED');
  const coverage = coverageFields(base, targetBase);
  const rows = aggregateRows(base, entityBase, parsed, temporalSemantics, coverage, parsed.breakdown);
  return assembleRvmLongitudinal(parsed, rows);
}

export function assembleRvmLongitudinal(parsed, rows) {
  const point = (row) => ({ period: row.period, ...(parsed.metric === 'MARKET_SHARE' ? { numerator: Number(row.numerator), denominator: Number(row.denominator) } : parsed.metric === 'RANK' ? { entityVin: Number(row.numerator), denominator: Number(row.denominator) } : {}), value: row.value == null ? null : Number(row.value) });
  const series = withChanges(rows.filter((row) => row.row_type === 'TOTAL').map(point));
  let seriesByBreakdown = null;
  if (parsed.breakdown) {
    const buckets = new Map();
    for (const row of rows.filter((item) => item.row_type === 'BREAKDOWN')) {
      if (!buckets.has(row.bucket_key)) buckets.set(row.bucket_key, { key: row.bucket_key, label: row.bucket_label, identityStatus: row.bucket_key === 'UNRESOLVED' ? 'UNRESOLVED' : row.bucket_key === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'RESOLVED', series: [] });
      buckets.get(row.bucket_key).series.push(point(row));
    }
    seriesByBreakdown = [...buckets.values()].map((bucket) => ({ ...bucket, series: withChanges(bucket.series) }));
  }
  const first = rows.find((row) => row.row_type === 'TOTAL') || {};
  const temporalSemantics = buildTemporalSemantics(parsed, first.last_observed_date);
  const counts = { resolved: first.identity_resolved, unresolved: first.identity_unresolved,
    ambiguous: first.identity_ambiguous, notApplicable: 0, total: first.identity_total };
  const dimensionCoverage = [coverageRow('PRODUCT_IDENTITY', counts)];
  const organizationCoverage = {
    scope: parsed.organizationScope,
    state: organizationCoverageState({ total: first.organization_total, unresolved: first.organization_unresolved, ambiguous: first.organization_ambiguous, organizationScope: parsed.organizationScope }),
    included: Number(first.organization_included || 0),
    excludedOtherOrganization: Number(first.organization_excluded || 0),
    unresolved: Number(first.organization_unresolved || 0),
    ambiguous: Number(first.organization_ambiguous || 0),
    total: Number(first.organization_total || 0),
  };
  const warnings = [...temporalWarnings(temporalSemantics), ...identityWarnings(dimensionCoverage)];
  if (organizationCoverage.state === 'PARTIAL') warnings.push('ORGANIZATION_SCOPE_PARTIAL');
  if (organizationCoverage.state === 'NO_COVERAGE') warnings.push('ORGANIZATION_SCOPE_NO_COVERAGE');
  if (organizationCoverage.state === 'AMBIGUOUS') warnings.push('ORGANIZATION_SCOPE_AMBIGUOUS');
  return outputEnvelope({ motor: ENGINE_NAME, domain: 'RVM', parsed, series, seriesByBreakdown,
    temporalSemantics, coverage: { dimensionCoverage, organizationCoverage }, warnings,
    metadata: { unit: parsed.metric === 'MARKET_SHARE' ? 'RATIO' : parsed.metric === 'RANK' ? 'ORDINAL_RANK' : 'N_RVM_VEHICLES', universeFilters: parsed.filters, entity: parsed.entity, organizationScope: parsed.organizationScope, denominatorExplicit: true,
      organizationScopeSemantics: 'organization_scope filters target RVM VIN by certified temporal membership; MARKET_SHARE denominator preserves the existing market universe',
      identityCoverageSemantics: 'PRODUCT_IDENTITY measures the joint model-alias resolution that supplies model_id; brand scope may additionally be certified by historical organization rules without creating model identity' } });
}

export async function buildRvmLongitudinal(input = {}, options = {}) {
  const parsed = parseRvmLongitudinalInput(input);
  const buildUniverse = options.buildUniverse ?? buildRvmUniverse;
  const universe = await buildUniverse({
    date_from: parsed.dateFrom,
    date_to: parsed.dateTo,
    cutoff_date: parsed.cutoffDate,
    cutoff_mode: parsed.cutoffMode,
    organization_scope: parsed.organizationScope,
    universe_filters: parsed.filters,
  });
  return calculateRvmLongitudinal(universe, parsed);
}
