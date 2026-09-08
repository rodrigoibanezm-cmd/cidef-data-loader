import { buildCrmUniverse } from '../crm-universe/buildCrmUniverse.js';

export const ENGINE_NAME = 'crm_context_v01';
export const ENGINE_VERSION = '0.1';

const COMMERCIAL_UNIVERSES = new Set(['OWN_STORES', 'COMPANY']);
const DATE_AXES = new Set(['ASSIGNED_AT', 'CREATED_AT']);
const FILTERS = new Set(['brand', 'product_interest', 'origin', 'suborigin', 'store']);
const AXIS_FIELD = Object.freeze({ ASSIGNED_AT: 'assigned_date', CREATED_AT: 'created_date' });
const SOLD_VALUES = new Set(['SI', 'S', 'YES', 'TRUE', '1']);
const NOT_SOLD_VALUES = new Set(['NO', 'N', 'FALSE', '0']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function contextError(code, detail = null) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function validDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function norm(value) {
  if (value == null || String(value).trim() === '') return null;
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim() || null;
}

function parseFilters(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contextError('UNSUPPORTED_FILTER', 'filters must be an object');
  }
  const filters = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!FILTERS.has(key)) throw contextError('UNSUPPORTED_FILTER', key);
    const values = [...new Set((Array.isArray(raw) ? raw : [raw])
      .map(norm).filter(Boolean))];
    if (!values.length) throw contextError('UNSUPPORTED_FILTER', `${key} has no usable values`);
    filters[key] = values;
  }
  return filters;
}

export function parseCrmContextInput(input = {}) {
  const commercialUniverse = String(input.commercial_universe ?? 'OWN_STORES').trim().toUpperCase();
  if (!COMMERCIAL_UNIVERSES.has(commercialUniverse)) {
    throw contextError('UNSUPPORTED_COMMERCIAL_UNIVERSE', commercialUniverse || 'missing');
  }
  const dateAxis = String(input.date_axis ?? 'ASSIGNED_AT').trim().toUpperCase();
  if (!DATE_AXES.has(dateAxis)) throw contextError('INVALID_DATE_AXIS', dateAxis || 'missing');
  const dateFrom = String(input.date_from ?? '');
  const dateTo = String(input.date_to ?? '');
  if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
    throw contextError('INVALID_PERIOD', 'date_from and date_to must be valid ISO dates with date_from <= date_to');
  }
  return {
    commercialUniverse,
    dateAxis,
    dateFrom,
    dateTo,
    filters: parseFilters(input.filters),
  };
}

const FILTER_FIELD = Object.freeze({
  brand: 'brand',
  product_interest: 'product_interest_norm',
  origin: 'origin_norm',
  suborigin: 'suborigin_norm',
  store: 'sucursal_nombre',
});

function matchesFilters(event, filters) {
  return Object.entries(filters).every(([key, accepted]) => {
    const current = norm(event[FILTER_FIELD[key]]);
    return current != null && accepted.includes(current);
  });
}

function maxDate(events, field) {
  const dates = events.map((event) => event[field]).filter(validDate).sort();
  return dates.length ? dates.at(-1) : null;
}

function ratio(numerator, denominator, unknownCount) {
  return {
    numerator,
    denominator,
    unknown_count: unknownCount,
    value: denominator === 0 ? null : numerator / denominator,
  };
}

function managementOutcome(event) {
  return event.managed_date == null ? 'UNMANAGED' : 'MANAGED';
}

function saleOutcome(event) {
  const value = norm(event.sold_norm ?? event.vendido_raw);
  if (SOLD_VALUES.has(value)) return 'SOLD';
  if (NOT_SOLD_VALUES.has(value)) return 'NOT_SOLD';
  return 'UNKNOWN';
}

function unavailable(reason) {
  return { available: false, reason };
}

function unavailableDistribution(reason) {
  return {
    available: false,
    reason,
    resolved_population: 0,
    unresolved_population: 0,
    denominator: 0,
    items: [],
  };
}

function unavailableCoverage(reason) {
  return {
    available: false,
    reason,
    resolved: 0,
    unresolved: 0,
    ambiguous: 0,
    not_applicable: 0,
    total: 0,
    resolved_ratio: null,
  };
}

function hasAnyField(events, fields) {
  return events.some((event) => fields.some((field) => Object.hasOwn(event, field)));
}

function availableCoverage({ resolved = 0, unresolved = 0, ambiguous = 0, notApplicable = 0, total = null } = {}) {
  const effectiveTotal = total ?? resolved + unresolved + ambiguous + notApplicable;
  return {
    available: true,
    reason: null,
    resolved,
    unresolved,
    ambiguous,
    not_applicable: notApplicable,
    total: effectiveTotal,
    resolved_ratio: effectiveTotal === 0 ? null : resolved / effectiveTotal,
  };
}

function identityCoverage(events, statusFor) {
  const counts = { resolved: 0, unresolved: 0, ambiguous: 0, notApplicable: 0 };
  for (const event of events) {
    const status = statusFor(event);
    if (status === 'RESOLVED') counts.resolved += 1;
    else if (status === 'AMBIGUOUS') counts.ambiguous += 1;
    else if (status === 'NOT_APPLICABLE') counts.notApplicable += 1;
    else counts.unresolved += 1;
  }
  return availableCoverage({ ...counts, total: events.length });
}

function rawDimension(event, normalizedField, rawField) {
  const key = norm(event[normalizedField] ?? event[rawField]);
  return key == null ? null : { key, label: String(event[rawField] ?? key).trim() || key };
}

function brandDimension(event) {
  if (event.product_interest_norm == null) return null;
  if (Number(event.brand_match_count || 0) !== 1 || event.brand == null) return null;
  const key = norm(event.brand);
  return key == null ? null : { key, label: String(event.brand).trim() };
}

const DEMAND_DIMENSIONS = Object.freeze({
  origin: (event) => rawDimension(event, 'origin_norm', 'origin_raw'),
  suborigin: (event) => rawDimension(event, 'suborigin_norm', 'suborigin_raw'),
  brand: brandDimension,
  product_interest: (event) => rawDimension(event, 'product_interest_norm', 'product_interest_raw'),
});

function distribution(events, resolver, shareField = 'share_of_resolved_population') {
  const buckets = new Map();
  let resolvedPopulation = 0;
  for (const event of events) {
    const resolved = resolver(event);
    if (!resolved) continue;
    resolvedPopulation += 1;
    const current = buckets.get(resolved.key) || { value: resolved.label, count: 0 };
    current.count += 1;
    if (String(resolved.label).localeCompare(String(current.value)) < 0) current.value = resolved.label;
    buckets.set(resolved.key, current);
  }
  const items = [...buckets.values()]
    .sort((a, b) => String(a.value).localeCompare(String(b.value)))
    .map((item) => ({ ...item, [shareField]: resolvedPopulation === 0 ? null : item.count / resolvedPopulation }));
  return {
    available: true,
    reason: null,
    resolved_population: resolvedPopulation,
    unresolved_population: events.length - resolvedPopulation,
    denominator: events.length,
    items,
  };
}

function buildDemandMix(events, universe) {
  const allEvents = universe.analytical_events;
  const supported = {
    origin: hasAnyField(allEvents, ['origin_norm', 'origin_raw']) || universe.coverage?.origin != null,
    suborigin: hasAnyField(allEvents, ['suborigin_norm', 'suborigin_raw']) || universe.coverage?.suborigin != null,
    brand: hasAnyField(allEvents, ['brand', 'brand_match_count']) || universe.coverage?.product_identity != null,
    product_interest: hasAnyField(allEvents, ['product_interest_norm', 'product_interest_raw']) || universe.coverage?.product_identity != null,
  };
  return Object.fromEntries(Object.entries(DEMAND_DIMENSIONS).map(([dimension, resolver]) => [
    dimension,
    supported[dimension]
      ? distribution(events, resolver)
      : unavailableDistribution('DIMENSION_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
  ]));
}

function buildAssignedHeadline(events, universe) {
  const allEvents = universe.analytical_events;
  const managementAvailable = allEvents.length === 0 || hasAnyField(allEvents, ['managed_date', 'managed_raw']);
  const outcomeAvailable = allEvents.length === 0 || hasAnyField(allEvents, ['sold_norm', 'vendido_raw']);
  const managed = events.filter((event) => managementOutcome(event) === 'MANAGED').length;
  const unmanaged = events.length - managed;
  const sold = events.filter((event) => saleOutcome(event) === 'SOLD').length;
  const notSold = events.filter((event) => saleOutcome(event) === 'NOT_SOLD').length;
  const unknownOutcome = events.length - sold - notSold;
  return {
    available: true,
    reason: null,
    leads_assigned: { count: events.length },
    managed: managementAvailable ? ratio(managed, managed + unmanaged, 0) : unavailable('METRIC_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    unmanaged: managementAvailable ? ratio(unmanaged, managed + unmanaged, 0) : unavailable('METRIC_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    management_coverage: managementAvailable ? ratio(managed, managed + unmanaged, 0) : unavailable('METRIC_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    sold: outcomeAvailable ? { count: sold } : unavailable('METRIC_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    not_sold: outcomeAvailable ? { count: notSold } : unavailable('METRIC_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    conversion_rate: outcomeAvailable ? ratio(sold, sold + notSold, unknownOutcome) : unavailable('METRIC_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
  };
}

function buildCreatedHeadline(events) {
  const reason = 'NOT_APPLICABLE_FOR_CREATED_AT_CONTEXT';
  return {
    available: true,
    reason: null,
    leads_created: { count: events.length },
    managed: unavailable(reason),
    unmanaged: unavailable(reason),
    management_coverage: unavailable(reason),
    sold: unavailable(reason),
    not_sold: unavailable(reason),
    conversion_rate: unavailable(reason),
  };
}

function stateDistribution(events, resolver, supported = true) {
  if (!supported) return unavailableDistribution('DIMENSION_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE');
  const result = distribution(events, resolver);
  return {
    available: result.available,
    reason: result.reason,
    resolved_population: result.resolved_population,
    unresolved_population: result.unresolved_population,
    denominator: result.denominator,
    items: result.items,
  };
}

function buildCommercialState(events, dateAxis, universe) {
  if (dateAxis === 'CREATED_AT') return unavailable('NOT_APPLICABLE_FOR_CREATED_AT_CONTEXT');
  const allEvents = universe.analytical_events;
  return {
    available: true,
    reason: null,
    status_distribution: stateDistribution(events, (event) => rawDimension(event, 'status_norm', 'estado_raw'), hasAnyField(allEvents, ['status_norm', 'estado_raw'])),
    interest_level_distribution: stateDistribution(events, (event) => rawDimension(event, 'interest_level_norm', 'interest_level'), hasAnyField(allEvents, ['interest_level_norm', 'interest_level'])),
    sold_not_sold: stateDistribution(events, (event) => {
      const outcome = saleOutcome(event);
      return outcome === 'UNKNOWN' ? null : { key: outcome, label: outcome };
    }, hasAnyField(allEvents, ['sold_norm', 'vendido_raw'])),
  };
}

function buildNetwork(events, commercialUniverse, universe) {
  if (commercialUniverse === 'COMPANY') return unavailable('NETWORK_NOT_APPLICABLE_FOR_COMPANY_CONTEXT');
  if (!hasAnyField(universe.analytical_events, ['store_resolution_status', 'sucursal_id', 'sucursal_nombre'])
    && universe.coverage?.store_identity == null) {
    return {
      available: false,
      reason: 'DIMENSION_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE',
      resolved_population: 0,
      unresolved_population: 0,
      denominator: 0,
      stores: [],
    };
  }
  const resolved = events.filter((event) => event.store_resolution_status === 'RESOLVED'
    && event.sucursal_id != null && event.sucursal_nombre != null);
  const buckets = new Map();
  for (const event of resolved) {
    const key = String(event.sucursal_id);
    const current = buckets.get(key) || {
      store_id: event.sucursal_id,
      store_name: event.sucursal_nombre,
      leads: 0,
    };
    current.leads += 1;
    buckets.set(key, current);
  }
  return {
    available: true,
    reason: null,
    resolved_population: resolved.length,
    unresolved_population: events.length - resolved.length,
    denominator: events.length,
    stores: [...buckets.values()]
      .sort((a, b) => String(a.store_name).localeCompare(String(b.store_name)))
      .map((store) => ({
        ...store,
        share_of_context_population: events.length === 0 ? null : store.leads / events.length,
      })),
  };
}

function brandStatus(event) {
  if (event.product_interest_norm == null) return 'NOT_APPLICABLE';
  if (Number(event.brand_match_count || 0) > 1) return 'AMBIGUOUS';
  return event.brand == null ? 'UNRESOLVED' : 'RESOLVED';
}

function buildQuality({ universe, population, filteredEvents, axisField }) {
  const dateResolved = filteredEvents.filter((event) => validDate(event[axisField])).length;
  const commercialScopeCoverage = availableCoverage({ resolved: population.length, total: population.length });
  const allEvents = universe.analytical_events;
  const quality = {
    commercial_scope_coverage: commercialScopeCoverage,
    date_axis_coverage: hasAnyField(allEvents, [axisField]) || universe.coverage?.dates?.[axisField] != null
      ? availableCoverage({ resolved: dateResolved, unresolved: filteredEvents.length - dateResolved, total: filteredEvents.length })
      : unavailableCoverage('COVERAGE_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    store_identity_coverage: hasAnyField(allEvents, ['store_resolution_status']) || universe.coverage?.store_identity != null
      ? identityCoverage(population, (event) => event.store_resolution_status)
      : unavailableCoverage('COVERAGE_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    seller_identity_coverage: hasAnyField(allEvents, ['seller_resolution_status']) || universe.coverage?.seller_identity != null
      ? identityCoverage(population, (event) => event.seller_resolution_status)
      : unavailableCoverage('COVERAGE_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    brand_identity_coverage: hasAnyField(allEvents, ['brand', 'brand_match_count']) || universe.coverage?.product_identity != null
      ? identityCoverage(population, brandStatus)
      : unavailableCoverage('COVERAGE_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    product_identity_coverage: hasAnyField(allEvents, ['product_identity_status']) || universe.coverage?.product_identity != null
      ? identityCoverage(population, (event) => event.product_identity_status)
      : unavailableCoverage('COVERAGE_NOT_AVAILABLE_FROM_SOURCE_UNIVERSE'),
    source_universe_coverage: universe.coverage || {},
    warnings: [...new Set(universe.warnings || [])],
  };
  for (const [name, coverage] of Object.entries(quality)) {
    if (name === 'warnings' || coverage.available !== true) continue;
    const prefix = name.replace(/_coverage$/, '').toUpperCase();
    if (coverage.unresolved > 0 || coverage.not_applicable > 0) quality.warnings.push(`${prefix}_UNRESOLVED_PRESENT`);
    if (coverage.ambiguous > 0) quality.warnings.push(`${prefix}_AMBIGUOUS_PRESENT`);
  }
  quality.warnings = [...new Set(quality.warnings)];
  return quality;
}

export function assembleCrmContextFromUniverse(parsed, universe) {
  if (universe?.universe !== 'crm_universe_v01' || !Array.isArray(universe.analytical_events)) {
    throw new Error('CRM_CONTEXT_REQUIRES_CRM_UNIVERSE_V01');
  }
  if (universe.commercial_universe && universe.commercial_universe !== parsed.commercialUniverse) {
    throw new Error('CRM_CONTEXT_UNIVERSE_SCOPE_MISMATCH');
  }
  const axisField = AXIS_FIELD[parsed.dateAxis];
  const filteredEvents = universe.analytical_events.filter((event) => matchesFilters(event, parsed.filters));
  const population = filteredEvents.filter((event) => validDate(event[axisField])
    && event[axisField] >= parsed.dateFrom && event[axisField] <= parsed.dateTo);
  const historicalCoverage = universe.coverage?.historical_states || {};
  const historicalStateAvailable = Number(historicalCoverage.historical_extra_versions || 0) > 0;
  const quality = buildQuality({ universe, population, filteredEvents, axisField });
  if (historicalStateAvailable) {
    quality.warnings = [...new Set([...quality.warnings, 'CRM_VERSIONED_HISTORY_AVAILABLE_CURRENT_CONTRACT_USES_CURRENT_STATE'])];
  }
  const selectionSemantics = parsed.dateAxis === 'ASSIGNED_AT'
    ? 'leads whose assigned_date is within the inclusive requested period and belong to the effective commercial_universe'
    : 'leads whose created_date is within the inclusive requested period and belong to the effective commercial_universe';
  const requestedScope = {
    commercial_universe: parsed.commercialUniverse,
    date_from: parsed.dateFrom,
    date_to: parsed.dateTo,
    date_axis: parsed.dateAxis,
    filters: parsed.filters,
  };
  const contextEvaluable = population.length > 0;
  return {
    scope: {
      commercial_universe: parsed.commercialUniverse,
      date_from: parsed.dateFrom,
      date_to: parsed.dateTo,
      date_axis: parsed.dateAxis,
      filters: parsed.filters,
      last_observed_date: universe.period?.last_observed_date ?? maxDate(filteredEvents, axisField),
      last_period_complete: universe.period?.last_period_complete ?? null,
      requested_scope: requestedScope,
      effective_scope: { ...requestedScope },
    },
    context_population: {
      count: population.length,
      selection_date_axis: parsed.dateAxis,
      selection_semantics: selectionSemantics,
    },
    headline: parsed.dateAxis === 'ASSIGNED_AT'
      ? buildAssignedHeadline(population, universe) : buildCreatedHeadline(population),
    demand_mix: buildDemandMix(population, universe),
    commercial_state: buildCommercialState(population, parsed.dateAxis, universe),
    network: buildNetwork(population, parsed.commercialUniverse, universe),
    quality,
    metadata: {
      capability: ENGINE_NAME,
      version: ENGINE_VERSION,
      source_universe: 'crm_universe_v01',
      commercial_universe: parsed.commercialUniverse,
      date_axis: parsed.dateAxis,
      state_semantics: 'CURRENT_STATE',
      historical_state_available: historicalStateAvailable,
      context_evaluable: contextEvaluable,
      ...(contextEvaluable ? {} : { context_evaluability_reason: 'NO_ANALYTICAL_EVENTS' }),
    },
  };
}

export async function buildCrmContext(input = {}, options = {}) {
  const parsed = parseCrmContextInput(input);
  const universe = options.universe || await buildCrmUniverse({
    commercial_universe: parsed.commercialUniverse,
    date_from: parsed.dateFrom,
    date_to: parsed.dateTo,
    eligibility_date_axis: parsed.dateAxis,
  }, options.universeOptions);
  return assembleCrmContextFromUniverse(parsed, universe);
}
