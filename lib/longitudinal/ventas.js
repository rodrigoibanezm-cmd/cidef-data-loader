import { customGptDb } from '../custom-gpt/db.js';
import { buildProductModelResolutionMap } from '../product-model-resolution/buildResolutionMap.js';
import { loadSkuEvidence } from '../product-model-resolution/loadSkuEvidence.js';
import { resolveSalesModels } from '../product-model-resolution/resolveSalesModels.js';
import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { loadProductIdentityMap } from '../ventas-product/loadProductIdentityMap.js';
import { resolveSalesProducts } from '../ventas-product/resolveSaleProduct.js';
import { enrichRecognizedSales } from '../ventas-org/enrichRecognizedSales.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import {
  buildTemporalSemantics, coverageRow, dateWithinComparableCutoff, enumeratePeriods,
  filterMatches, identityWarnings, normalizeEnum, outputEnvelope, parseCutoff,
  parseDateRange, parseFilterObject, parseTimeGrain, periodForDate, semanticError,
  temporalWarnings, withChanges,
} from './common.js';

export const ENGINE_NAME = 'ventas_longitudinal_context_v01';
const METRICS = new Set(['VIN_SALES', 'SHARE_WITHIN_CIDEF']);
const GRAINS = new Set(['TOTAL', 'CHANNEL', 'STORE', 'DEALER', 'DEALER_GROUP', 'SELLER', 'BRAND', 'MODEL', 'VERSION']);
const FILTERS = new Set(['channel', 'store_id', 'store', 'dealer_id', 'dealer', 'dealer_group_id', 'dealer_group', 'seller_id', 'seller', 'brand_id', 'brand', 'model_id', 'model', 'version_id', 'version']);
const BREAKDOWNS = new Set([...GRAINS].filter((value) => value !== 'TOTAL'));
const GRAIN_FILTERS = Object.freeze({
  CHANNEL: ['channel'], STORE: ['store_id', 'store'], DEALER: ['dealer_id', 'dealer'],
  DEALER_GROUP: ['dealer_group_id', 'dealer_group'], SELLER: ['seller_id', 'seller'],
  BRAND: ['brand_id', 'brand'], MODEL: ['model_id', 'model'], VERSION: ['version_id', 'version'], TOTAL: [],
});

export function parseVentasLongitudinalInput(input = {}) {
  const range = parseDateRange(input);
  const metric = normalizeEnum(input.metric, METRICS, 'INVALID_METRIC');
  const grain = normalizeEnum(input.grain, GRAINS, 'INVALID_GRAIN', 'TOTAL');
  const timeGrain = parseTimeGrain(input.time_grain);
  const filters = parseFilterObject(input.filters, FILTERS);
  const breakdown = input.breakdown == null ? null : normalizeEnum(input.breakdown, BREAKDOWNS, 'INVALID_BREAKDOWN');
  if (grain === 'SELLER' && filters.channel && !filters.channel.some((value) => String(value).toUpperCase() === 'CIDEF')) {
    throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'SELLER is restricted to VENDEDOR_CIDEF');
  }
  return { metric, grain, timeGrain, filters, breakdown, ...parseCutoff(input), ...range };
}

function dimension(event, grain) {
  if (grain === 'STORE' && event.store_identity_status === 'AMBIGUA') {
    return { key: 'AMBIGUOUS', label: 'AMBIGUOUS', identityStatus: 'AMBIGUOUS' };
  }
  if (['DEALER', 'DEALER_GROUP'].includes(grain)
    && !['DEALER', 'DEALER_AGREGADO'].includes(event.tipo_canal)) {
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
  const ambiguous = ['BRAND', 'MODEL'].includes(grain)
    && event.product_identity_status === 'AMBIGUOUS';
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

function aggregate(events, parsed, comparisonDay, extraPredicate = () => true, denominatorFilters = []) {
  const periods = enumeratePeriods(parsed.dateFrom, parsed.dateTo, parsed.timeGrain);
  const scoped = events.filter((event) => dateWithinComparableCutoff(event.fecha_venta_iso, parsed, comparisonDay)
    && eventMatches(event, parsed.filters) && extraPredicate(event));
  const denominator = events.filter((event) => dateWithinComparableCutoff(event.fecha_venta_iso, parsed, comparisonDay)
    && eventMatches(event, parsed.filters, denominatorFilters) && extraPredicate(event));
  return periods.map((period) => {
    const numerator = scoped.filter((event) => periodForDate(event.fecha_venta_iso, parsed.timeGrain) === period).length;
    const base = denominator.filter((event) => periodForDate(event.fecha_venta_iso, parsed.timeGrain) === period).length;
    return parsed.metric === 'VIN_SALES'
      ? { period, value: numerator }
      : { period, numerator, denominator: base, value: base === 0 ? null : numerator / base };
  });
}

export function calculateVentasLongitudinal(events, parsed) {
  const applicable = events.filter((event) => event.fecha_venta_iso.slice(0, 10) >= parsed.dateFrom
    && event.fecha_venta_iso.slice(0, 10) <= parsed.dateTo && eventMatches(event, parsed.filters));
  const lastObservedDate = applicable.reduce((max, event) => {
    const day = event.fecha_venta_iso.slice(0, 10);
    return max == null || day > max ? day : max;
  }, null);
  const temporalSemantics = buildTemporalSemantics(parsed, lastObservedDate);
  const comparisonDay = temporalSemantics.comparisonDay ?? null;
  const denominatorFilters = GRAIN_FILTERS[parsed.grain];
  const series = withChanges(aggregate(events, parsed, comparisonDay, () => true, denominatorFilters));
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
      series: withChanges(aggregate(events, parsed, comparisonDay, (event) => dimension(event, parsed.breakdown).key === bucket.key, denominatorFilters)),
    }));
  }
  const coverageEvents = applicable.filter((event) => dateWithinComparableCutoff(event.fecha_venta_iso, parsed, comparisonDay));
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
  return outputEnvelope({ motor: ENGINE_NAME, domain: 'VENTAS', parsed, series, seriesByBreakdown,
    temporalSemantics, coverage: { dimensionCoverage }, warnings, metadata: {
    unit: 'N_VIN_RECOGNIZED_SALES', recognition: 'ventas_context_v01 LAST-by-VIN inside date_to cutoff',
    sameDaySemantics: 'Comparable calendar-day truncation over recognized sales; not historical recognition-state reconstruction',
    sellerPolicy: 'VENDEDOR_CIDEF date-effective assignment at observed canonical CIDEF store',
    shareDefinition: parsed.metric === 'SHARE_WITHIN_CIDEF' ? 'grain numerator / CIDEF sales after all non-grain filters in the same period' : null,
  } });
}

async function loadCatalogs(sql) {
  const [models, versions] = await Promise.all([
    sql.query(`SELECT m.modelo_id,m.marca_id,m.nombre_canonico modelo,ma.nombre_canonico marca FROM modelos_master_v01 m JOIN marcas_master_v01 ma USING(marca_id)`),
    sql.query(`SELECT v.version_id,v.modelo_id,v.nombre_canonico version FROM versiones_master_v01 v`),
  ]);
  return { models: new Map(models.map((row) => [String(row.modelo_id), row])), versions: new Map(versions.map((row) => [String(row.version_id), row])) };
}

export async function buildVentasLongitudinal(input = {}) {
  const parsed = parseVentasLongitudinalInput(input);
  const sql = customGptDb();
  const [ventas, orgMaps, aliases, evidence, catalogs] = await Promise.all([
    buildVentasContext({ cutoffDate: parsed.dateTo }), loadOrganizationalIdentityMaps(sql),
    loadProductIdentityMap(sql), loadSkuEvidence(sql), loadCatalogs(sql),
  ]);
  const exact = resolveSalesModels(ventas.recognizedSales, buildProductModelResolutionMap(evidence, aliases));
  const aliasResolved = resolveSalesProducts(ventas.recognizedSales, aliases);
  const organization = enrichRecognizedSales(ventas.recognizedSales, orgMaps);
  const events = exact.map((sale, index) => {
    const alias = aliasResolved[index];
    const org = organization[index];
    const model = sale.modelo_id == null ? null : catalogs.models.get(String(sale.modelo_id));
    const versionId = alias?.modelo_id != null && Number(alias.modelo_id) === Number(sale.modelo_id) ? alias.version_id : null;
    const version = versionId == null ? null : catalogs.versions.get(String(versionId));
    return { ...sale, ...org, version_id: versionId, version_nombre: version?.version ?? null,
      marca_id: model?.marca_id ?? null, marca_nombre: model?.marca ?? null, modelo_nombre: model?.modelo ?? null };
  });
  return calculateVentasLongitudinal(events, parsed);
}
