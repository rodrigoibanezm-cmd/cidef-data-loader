import { parseCommercialUniverse } from '../ventas-commercial/buildVentasCommercialContext.js';
import { buildVentasUniverses } from '../ventas-universe/buildVentasUniverse.js';
import {
  buildTemporalSemantics, coverageRow, dateWithinComparableCutoff, enumeratePeriods,
  filterMatches, identityWarnings, normalizeEnum, outputEnvelope, parseCutoff,
  parseDateRange, parseFilterObject, parseTimeGrain, periodForDate, semanticError,
  temporalWarnings, withChanges,
} from './common.js';

export const ENGINE_NAME = 'ventas_longitudinal_context_v01';
const METRICS = new Set(['VIN_SALES', 'SHARE_WITHIN_CIDEF', 'SHARE_WITHIN_COMMERCIAL_UNIVERSE', 'CHANNEL_MIX_WITHIN_CIDEF']);
const GRAINS = new Set(['TOTAL', 'CHANNEL', 'STORE', 'DEALER', 'DEALER_GROUP', 'SELLER', 'BRAND', 'MODEL', 'VERSION']);
const FILTERS = new Set(['channel', 'store_id', 'store', 'dealer_id', 'dealer', 'dealer_group_id', 'dealer_group', 'seller_id', 'seller', 'brand_id', 'brand', 'model_id', 'model', 'version_id', 'version']);
const CHANNEL_MIX_FILTERS = new Set(['brand_id', 'brand', 'model_id', 'model', 'version_id', 'version']);
const BREAKDOWNS = new Set([...GRAINS].filter((value) => value !== 'TOTAL'));
const GRAIN_FILTERS = Object.freeze({
  CHANNEL: ['channel'], STORE: ['store_id', 'store'], DEALER: ['dealer_id', 'dealer'],
  DEALER_GROUP: ['dealer_group_id', 'dealer_group'], SELLER: ['seller_id', 'seller'],
  BRAND: ['brand_id', 'brand'], MODEL: ['model_id', 'model'], VERSION: ['version_id', 'version'], TOTAL: [],
});

function isShareWithinUniverseMetric(metric) {
  return metric === 'SHARE_WITHIN_CIDEF' || metric === 'SHARE_WITHIN_COMMERCIAL_UNIVERSE';
}

function metricUniverseContract(parsed) {
  if (parsed.metric === 'VIN_SALES') {
    return {
      numerator_universe: parsed.commercialUniverse,
      denominator_universe: null,
      denominator_source: 'NONE',
      universe_relation: 'SAME_UNIVERSE',
      evaluability: 'EVALUABLE',
    };
  }
  if (isShareWithinUniverseMetric(parsed.metric)) {
    return {
      numerator_universe: parsed.commercialUniverse,
      denominator_universe: parsed.commercialUniverse,
      denominator_source: 'SAME_COMMERCIAL_UNIVERSE',
      universe_relation: 'SAME_UNIVERSE',
      evaluability: 'EVALUABLE',
      legacy_alias: parsed.metric === 'SHARE_WITHIN_CIDEF',
    };
  }
  return {
    numerator_universe: parsed.commercialUniverse,
    denominator_universe: 'COMPANY',
    denominator_source: 'CIDEF_COMPANY',
    universe_relation: 'PART_OF_PARENT',
    evaluability: 'EVALUABLE',
  };
}

function assertDomainCompatibility(commercialUniverse, grain, breakdown, metric, filters) {
  const grains = [grain, breakdown].filter(Boolean);
  if (grains.some((value) => ['STORE', 'SELLER'].includes(value)) && commercialUniverse !== 'OWN_STORES') {
    throw semanticError('DOMAIN_MISMATCH', 'STORE/SELLER analysis requires commercial_universe=OWN_STORES');
  }
  if (grains.some((value) => ['DEALER', 'DEALER_GROUP'].includes(value)) && commercialUniverse !== 'DEALERS') {
    throw semanticError('DOMAIN_MISMATCH', 'DEALER/DEALER_GROUP analysis requires commercial_universe=DEALERS');
  }
  if (metric === 'CHANNEL_MIX_WITHIN_CIDEF') {
    if (!['OWN_STORES', 'DEALERS'].includes(commercialUniverse)) {
      throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'CHANNEL_MIX_WITHIN_CIDEF requires commercial_universe=OWN_STORES or DEALERS');
    }
    if (grain !== 'TOTAL' || breakdown != null) {
      throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'CHANNEL_MIX_WITHIN_CIDEF requires grain=TOTAL and no breakdown; use product filters to restrict brand/model/version');
    }
    const incompatibleFilters = Object.keys(filters).filter((key) => !CHANNEL_MIX_FILTERS.has(key));
    if (incompatibleFilters.length) {
      throw semanticError('DOMAIN_MISMATCH', `CHANNEL_MIX_WITHIN_CIDEF filters must be denominator-compatible product filters; incompatible: ${incompatibleFilters.join(',')}`);
    }
  }
}

export function parseVentasLongitudinalInput(input = {}) {
  const range = parseDateRange(input);
  const metric = normalizeEnum(input.metric, METRICS, 'INVALID_METRIC');
  const grain = normalizeEnum(input.grain, GRAINS, 'INVALID_GRAIN', 'TOTAL');
  const timeGrain = parseTimeGrain(input.time_grain);
  const filters = parseFilterObject(input.filters, FILTERS);
  const breakdown = input.breakdown == null ? null : normalizeEnum(input.breakdown, BREAKDOWNS, 'INVALID_BREAKDOWN');
  if (input.commercial_universe == null) {
    throw semanticError('MISSING_COMMERCIAL_UNIVERSE', 'VENTAS longitudinal analysis requires an explicit commercial_universe');
  }
  const commercialUniverse = parseCommercialUniverse(input.commercial_universe);
  assertDomainCompatibility(commercialUniverse, grain, breakdown, metric, filters);
  if (grain === 'SELLER' && filters.channel && !filters.channel.some((value) => String(value).toUpperCase() === 'CIDEF')) {
    throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'SELLER is restricted to VENDEDOR_CIDEF');
  }
  return { metric, grain, timeGrain, filters, breakdown, commercialUniverse, ...parseCutoff(input), ...range };
}

function dimension(event, grain) {
  if (grain === 'STORE' && event.store_identity_status === 'AMBIGUA') {
    return { key: 'AMBIGUOUS', label: 'AMBIGUOUS', identityStatus: 'AMBIGUOUS' };
  }
  if (['DEALER', 'DEALER_GROUP'].includes(grain) && event.tipo_canal !== 'DEALER') {
    return { key: 'NOT_APPLICABLE', label: 'NOT_APPLICABLE', identityStatus: 'NOT_APPLICABLE' };
  }
  if (grain === 'SELLER' && event.tipo_canal !== 'CIDEF') {
    return { key: 'NOT_APPLICABLE', label: 'NOT_APPLICABLE', identityStatus: 'NOT_APPLICABLE' };
  }
  if (grain === 'SELLER' && !event.eligible_vendedor_cidef) {
    const status = event.seller_identity_status === 'AMBIGUA' ? 'AMBIGUOUS'
      : event.persona_id == null ? 'UNRESOLVED' : 'NOT_APPLICABLE';
    return { key: status, label: status, identityStatus: status };
  }
  const map = {
    CHANNEL: [event.tipo_canal, event.tipo_canal],
    STORE: [event.sucursal_id, event.sucursal_nombre],
    DEALER: [event.dealer_id, event.dealer_nombre],
    DEALER_GROUP: [event.dealer_group_id, event.dealer_group_nombre],
    SELLER: [event.persona_id, event.persona_nombre],
    BRAND: [event.marca_id, event.marca_nombre],
    MODEL: [event.modelo_id, event.modelo_nombre],
    VERSION: [event.version_id, event.version_nombre],
  };
  const [key, label] = map[grain] || [null, null];
  const ambiguous = ['BRAND', 'MODEL'].includes(grain) && event.product_identity_status === 'AMBIGUOUS';
  return ambiguous ? { key: 'AMBIGUOUS', label: 'AMBIGUOUS', identityStatus: 'AMBIGUOUS' }
    : key == null ? { key: 'UNRESOLVED', label: 'UNRESOLVED', identityStatus: 'UNRESOLVED' }
    : { key: String(key), label: label == null ? String(key) : String(label), identityStatus: 'RESOLVED' };
}

function eventMatches(event, filters, omitted = []) {
  const values = {
    channel: event.tipo_canal, store_id: event.sucursal_id, store: event.sucursal_nombre,
    dealer_id: event.dealer_id, dealer: event.dealer_nombre,
    dealer_group_id: event.dealer_group_id, dealer_group: event.dealer_group_nombre,
    seller_id: event.eligible_vendedor_cidef ? event.persona_id : null,
    seller: event.eligible_vendedor_cidef ? event.persona_nombre : null,
    brand_id: event.marca_id, brand: event.marca_nombre,
    model_id: event.modelo_id, model: event.modelo_nombre,
    version_id: event.version_id, version: event.version_nombre,
  };
  return Object.entries(filters).every(([key, accepted]) => omitted.includes(key) || filterMatches(values[key], accepted));
}

function aggregate(events, parsed, comparisonDay, extraPredicate = () => true, denominatorFilters = [], denominatorEvents = events) {
  const periods = enumeratePeriods(parsed.dateFrom, parsed.dateTo, parsed.timeGrain);
  const scoped = events.filter((event) => dateWithinComparableCutoff(event.fecha_venta_iso, parsed, comparisonDay)
    && eventMatches(event, parsed.filters) && extraPredicate(event));
  const denominator = denominatorEvents.filter((event) => dateWithinComparableCutoff(event.fecha_venta_iso, parsed, comparisonDay)
    && eventMatches(event, parsed.filters, denominatorFilters) && extraPredicate(event));
  return periods.map((period) => {
    const numerator = scoped.filter((event) => periodForDate(event.fecha_venta_iso, parsed.timeGrain) === period).length;
    const base = denominator.filter((event) => periodForDate(event.fecha_venta_iso, parsed.timeGrain) === period).length;
    return parsed.metric === 'VIN_SALES'
      ? { period, value: numerator }
      : { period, numerator, denominator: base, value: base === 0 ? null : numerator / base };
  });
}

export function calculateVentasLongitudinal(events, parsed, options = {}) {
  const denominatorEvents = Array.isArray(options.denominatorEvents) ? options.denominatorEvents : events;
  const coverageUniverse = parsed.metric === 'CHANNEL_MIX_WITHIN_CIDEF' ? denominatorEvents : events;
  const applicable = coverageUniverse.filter((event) => event.fecha_venta_iso.slice(0, 10) >= parsed.dateFrom
    && event.fecha_venta_iso.slice(0, 10) <= parsed.dateTo && eventMatches(event, parsed.filters));
  const lastObservedDate = applicable.reduce((max, event) => {
    const day = event.fecha_venta_iso.slice(0, 10);
    return max == null || day > max ? day : max;
  }, null);
  const temporalSemantics = buildTemporalSemantics(parsed, lastObservedDate);
  const comparisonDay = temporalSemantics.comparisonDay ?? null;
  const denominatorFilters = parsed.metric === 'CHANNEL_MIX_WITHIN_CIDEF' ? [] : GRAIN_FILTERS[parsed.grain];
  const series = withChanges(aggregate(events, parsed, comparisonDay, () => true, denominatorFilters, denominatorEvents));
  let seriesByBreakdown = null;
  if (parsed.breakdown) {
    const buckets = new Map();
    for (const event of events.filter((row) => eventMatches(row, parsed.filters)
      && dateWithinComparableCutoff(row.fecha_venta_iso, parsed, comparisonDay))) {
      const bucket = dimension(event, parsed.breakdown);
      buckets.set(bucket.key, bucket);
    }
    seriesByBreakdown = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map((bucket) => ({
      ...bucket,
      series: withChanges(aggregate(events, parsed, comparisonDay, (event) => dimension(event, parsed.breakdown).key === bucket.key, denominatorFilters, denominatorEvents)),
    }));
  }
  const coverageEvents = events.filter((event) => event.fecha_venta_iso.slice(0, 10) >= parsed.dateFrom
    && event.fecha_venta_iso.slice(0, 10) <= parsed.dateTo && eventMatches(event, parsed.filters)
    && dateWithinComparableCutoff(event.fecha_venta_iso, parsed, comparisonDay));
  const dimensions = [...new Set(['STORE', 'SELLER', 'BRAND', 'MODEL', parsed.grain, parsed.breakdown]
    .filter((value) => value && value !== 'TOTAL'))];
  const dimensionCoverage = dimensions.map((grain) => {
    const statuses = coverageEvents.map((event) => dimension(event, grain).identityStatus);
    return coverageRow(grain, {
      resolved: statuses.filter((value) => value === 'RESOLVED').length,
      unresolved: statuses.filter((value) => value === 'UNRESOLVED').length,
      ambiguous: statuses.filter((value) => value === 'AMBIGUOUS').length,
      notApplicable: statuses.filter((value) => value === 'NOT_APPLICABLE').length,
      total: statuses.length,
    });
  });
  const warnings = [...temporalWarnings(temporalSemantics), ...identityWarnings(dimensionCoverage)];
  if (parsed.metric === 'SHARE_WITHIN_CIDEF') warnings.push('LEGACY_METRIC_ALIAS_SHARE_WITHIN_CIDEF');
  return outputEnvelope({ motor: ENGINE_NAME, domain: 'VENTAS', parsed, series, seriesByBreakdown,
    temporalSemantics, coverage: { dimensionCoverage }, warnings, metadata: {
    unit: 'N_VIN_RECOGNIZED_SALES', recognition: 'ventas_context_v01 LAST-by-VIN inside date_to cutoff',
    commercialScope: parsed.commercialUniverse,
    commercialAuthority: 'vehiculo_canonico',
    metricUniverseContract: metricUniverseContract(parsed),
    sameDaySemantics: 'Comparable calendar-day truncation over recognized sales; not historical recognition-state reconstruction',
    sellerPolicy: 'VENDEDOR_CIDEF date-effective assignment at certified OWN_STORES destination',
    shareDefinition: isShareWithinUniverseMetric(parsed.metric)
      ? 'grain numerator / same certified commercial_universe after all non-grain filters in the same period'
      : parsed.metric === 'CHANNEL_MIX_WITHIN_CIDEF'
        ? 'selected channel universe numerator / COMPANY denominator after the exact same product filters in the same period'
        : null,
  } });
}

export async function buildVentasLongitudinal(input = {}) {
  const parsed = parseVentasLongitudinalInput(input);
  const requestedUniverses = parsed.metric === 'CHANNEL_MIX_WITHIN_CIDEF'
    ? [parsed.commercialUniverse, 'COMPANY']
    : [parsed.commercialUniverse];
  const universes = await buildVentasUniverses(
    { cutoff_date: parsed.dateTo },
    requestedUniverses,
  );
  const universe = universes.get(parsed.commercialUniverse);
  const companyUniverse = parsed.metric === 'CHANNEL_MIX_WITHIN_CIDEF'
    ? universes.get('COMPANY')
    : null;
  const events = universe.analytical_events;
  const denominatorEvents = companyUniverse?.analytical_events ?? events;
  const result = calculateVentasLongitudinal(events, parsed, { denominatorEvents });
  return {
    ...result,
    commercial_scope: universe.commercial_scope,
    commercial_coverage: universe.coverage.commercial,
    commercial_validation: {
      valid: universe.validation.commercial_scope_valid,
      violations: universe.validation.violations,
    },
    denominator_commercial_scope: companyUniverse?.commercial_scope ?? universe.commercial_scope,
    denominator_commercial_coverage: companyUniverse?.coverage.commercial ?? universe.coverage.commercial,
  };
}
