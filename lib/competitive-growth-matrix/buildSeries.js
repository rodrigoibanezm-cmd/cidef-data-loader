import { toIsoDate } from '../longitudinal/common.js';

const add = (map, key, value) => map.set(key, (map.get(key) || 0) + value);
const entityKey = (scope, brandId = null, modelId = null) => `${scope}:${brandId ?? ''}:${modelId ?? ''}`;

function normalizeStatus(value) {
  const status = String(value || '').toUpperCase();
  if (['RESUELTO', 'RESOLVED', 'RESUELTA'].includes(status)) return 'RESOLVED';
  if (['AMBIGUO', 'AMBIGUOUS', 'AMBIGUA'].includes(status)) return 'AMBIGUOUS';
  return 'UNRESOLVED';
}

function sourceIndex(events, kind, brandCatalog) {
  const series = new Map();
  const metadata = new Map();
  const origin = { CHINESE: 0, OTHER: 0, UNKNOWN: 0, total: 0 };
  const identity = { brand_resolved: 0, brand_unresolved: 0, model_resolved: 0, model_unresolved: 0, model_ambiguous: 0, total: 0 };
  let minDate = null;
  let maxDate = null;
  let minPeriod = null;
  let maxPeriod = null;

  const ensure = (scope, brandId = null, modelId = null, meta = {}) => {
    const key = entityKey(scope, brandId, modelId);
    if (!series.has(key)) series.set(key, { months: new Map(), days: new Map(), firstObservedPeriod: null });
    if (!metadata.has(key)) metadata.set(key, { comparison_scope: scope, brand_id: brandId, model_id: modelId, ...meta });
    return series.get(key);
  };

  const contribute = (scope, date, period, units, brandId = null, modelId = null, meta = {}) => {
    const target = ensure(scope, brandId, modelId, meta);
    add(target.days, date, units);
    add(target.months, period, units);
    if (target.firstObservedPeriod == null || period < target.firstObservedPeriod) {
      target.firstObservedPeriod = period;
    }
  };

  for (const event of events) {
    const date = toIsoDate(kind === 'CIDEF' ? event.fecha_venta_iso : event.fecha);
    if (!date) continue;
    const period = kind === 'CIDEF' ? String(event.mes_venta || '') : date.slice(0, 7);
    if (kind === 'CIDEF' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new Error('ventas_universe_v01 commercial mes_venta is required');
    }
    const units = kind === 'CIDEF' ? 1 : Number(event.cantidad || 0);
    const brandIdRaw = kind === 'CIDEF' ? event.marca_id : event.scope_brand_id;
    const modelIdRaw = kind === 'CIDEF' ? event.modelo_id : event.model_id;
    const brandId = Number.isSafeInteger(Number(brandIdRaw)) && Number(brandIdRaw) > 0 ? Number(brandIdRaw) : null;
    const modelId = Number.isSafeInteger(Number(modelIdRaw)) && Number(modelIdRaw) > 0 ? Number(modelIdRaw) : null;
    const status = normalizeStatus(kind === 'CIDEF' ? event.product_identity_status : event.identity_status);
    const masterBrand = brandId == null ? null : brandCatalog.get(brandId);
    const originGroup = kind === 'CIDEF' ? masterBrand?.origin_group ?? null : event.brand_origin_group ?? null;
    const brandName = kind === 'CIDEF' ? event.marca_nombre ?? masterBrand?.brand_name : event.brand_name;
    const modelName = kind === 'CIDEF' ? event.modelo_nombre : event.model_name;
    minDate = minDate == null || date < minDate ? date : minDate;
    maxDate = maxDate == null || date > maxDate ? date : maxDate;
    minPeriod = minPeriod == null || period < minPeriod ? period : minPeriod;
    maxPeriod = maxPeriod == null || period > maxPeriod ? period : maxPeriod;
    origin.total += units;
    origin[originGroup === 'CHINESE' ? 'CHINESE' : originGroup == null ? 'UNKNOWN' : 'OTHER'] += units;
    identity.total += units;
    identity[brandId == null ? 'brand_unresolved' : 'brand_resolved'] += units;
    if (modelId != null && status === 'RESOLVED') identity.model_resolved += units;
    else if (status === 'AMBIGUOUS') identity.model_ambiguous += units;
    else identity.model_unresolved += units;

    contribute('TOTAL_MARKET', date, period, units);
    if (originGroup === 'CHINESE') contribute('CHINESE_MARKET', date, period, units);
    if (brandId != null) contribute('BRAND', date, period, units, brandId, null, { brand_name: brandName ?? String(brandId), model_name: null });
    if (brandId != null && modelId != null && status === 'RESOLVED') {
      contribute('MODEL', date, period, units, brandId, modelId, {
        brand_name: brandName ?? String(brandId), model_name: modelName ?? String(modelId),
      });
    }
  }
  ensure('TOTAL_MARKET');
  ensure('CHINESE_MARKET');
  origin.reconciles = origin.CHINESE + origin.OTHER + origin.UNKNOWN === origin.total;
  identity.brand_reconciles = identity.brand_resolved + identity.brand_unresolved === identity.total;
  identity.model_reconciles = identity.model_resolved + identity.model_unresolved + identity.model_ambiguous === identity.total;
  return { series, metadata, origin, identity, minDate, maxDate, minPeriod, maxPeriod };
}

export function buildGrowthSeries(ventasUniverse, rvmUniverse, brandRows = [], parsed) {
  if (ventasUniverse?.universe !== 'ventas_universe_v01' || ventasUniverse.commercial_universe !== 'COMPANY') {
    throw new Error('COMPANY ventas_universe_v01 is required');
  }
  if (rvmUniverse?.universe !== 'rvm_universe_v01' || rvmUniverse.organization_scope !== 'ALL'
    || rvmUniverse.data_status !== 'CONSOLIDATED') {
    throw new Error('CONSOLIDATED ALL rvm_universe_v01 is required');
  }
  const brandCatalog = new Map(brandRows.map((row) => [Number(row.marca_id), {
    brand_name: row.nombre_canonico,
    origin_group: row.origin_group ?? null,
  }]));
  const cidef = sourceIndex(ventasUniverse.analytical_events, 'CIDEF', brandCatalog);
  const benchmark = sourceIndex(rvmUniverse.analytical_events, 'BENCHMARK', brandCatalog);
  const entities = [];
  for (const [key, meta] of cidef.metadata) {
    if (!parsed.comparisonScopes.includes(meta.comparison_scope)) continue;
    if (meta.comparison_scope === 'BRAND' && parsed.brandIds.length && !parsed.brandIds.includes(meta.brand_id)) continue;
    if (meta.comparison_scope === 'MODEL') {
      if (parsed.brandIds.length && !parsed.brandIds.includes(meta.brand_id)) continue;
      if (parsed.modelIds.length && !parsed.modelIds.includes(meta.model_id)) continue;
    }
    entities.push({ key, ...meta, first_observed_period: cidef.series.get(key)?.firstObservedPeriod ?? null });
  }
  entities.sort((a, b) => a.comparison_scope.localeCompare(b.comparison_scope)
    || (a.brand_id ?? 0) - (b.brand_id ?? 0) || (a.model_id ?? 0) - (b.model_id ?? 0));
  return {
    cidef, benchmark, entities, brandCatalog,
    coverage: {
      cidef: { origin: cidef.origin, identity: cidef.identity },
      benchmark: { origin: benchmark.origin, identity: benchmark.identity },
      benchmark_only: {
        brands: [...benchmark.metadata.keys()].filter((key) => key.startsWith('BRAND:') && !cidef.metadata.has(key)).length,
        models: [...benchmark.metadata.keys()].filter((key) => key.startsWith('MODEL:') && !cidef.metadata.has(key)).length,
      },
    },
  };
}

export function buildPreliminarySeries(rvmUniverse, brandCatalog) {
  if (rvmUniverse?.universe !== 'rvm_universe_v01' || rvmUniverse.organization_scope !== 'ALL'
    || rvmUniverse.data_status !== 'PRELIMINARY' || !rvmUniverse.snapshot_date) {
    throw new Error('single-snapshot PRELIMINARY ALL rvm_universe_v01 is required');
  }
  return sourceIndex(rvmUniverse.analytical_events, 'BENCHMARK', brandCatalog);
}

export { entityKey };
