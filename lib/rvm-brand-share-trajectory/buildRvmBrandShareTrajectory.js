import { enumeratePeriods, semanticError } from '../longitudinal/common.js';
import { parseOrganizationScope } from '../rvm/rvmOrganizationScopeSql.js';

const TIME_GRAINS = new Set(['MONTH', 'YEAR']);
const ALLOWED_FIELDS = new Set([
  'entity', 'date_from', 'date_to', 'time_grain', 'organization_scope',
  'cutoff_date', 'cutoff_mode',
]);

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseRvmBrandShareTrajectoryInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw semanticError('INVALID_SHARE_TRAJECTORY_INPUT');
  }
  const unsupported = Object.keys(input).find((field) => !ALLOWED_FIELDS.has(field));
  if (unsupported) throw semanticError('UNSUPPORTED_SHARE_TRAJECTORY_FIELD', unsupported);

  const entity = input.entity;
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
    throw semanticError('ENTITY_REQUIRED');
  }
  const entityFields = Object.keys(entity);
  if (entityFields.length !== 1 || !['brand', 'brand_id'].includes(entityFields[0])) {
    throw semanticError('INVALID_BRAND_ENTITY');
  }

  let brand = null;
  let brandId = null;
  if (entityFields[0] === 'brand') {
    if (typeof entity.brand !== 'string' || !entity.brand.trim()) {
      throw semanticError('INVALID_BRAND_ENTITY');
    }
    brand = entity.brand.trim();
  } else {
    brandId = Number(entity.brand_id);
    if (!Number.isSafeInteger(brandId) || brandId <= 0) {
      throw semanticError('INVALID_BRAND_ENTITY');
    }
  }

  const dateFrom = String(input.date_from || '');
  const dateTo = String(input.date_to || '');
  if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
    throw semanticError('INVALID_DATE_RANGE');
  }
  const timeGrain = String(input.time_grain || 'MONTH').trim().toUpperCase();
  if (!TIME_GRAINS.has(timeGrain)) throw semanticError('INVALID_TIME_GRAIN');
  const organizationScope = parseOrganizationScope(input.organization_scope, { required: true });
  const cutoffMode = String(input.cutoff_mode || 'FULL_PERIOD').trim().toUpperCase();
  if (!['FULL_PERIOD', 'SAME_DAY'].includes(cutoffMode)) throw semanticError('INVALID_CUTOFF_MODE');
  const cutoffDate = input.cutoff_date == null || input.cutoff_date === ''
    ? null : String(input.cutoff_date);
  if (cutoffDate != null && !validDate(cutoffDate)) throw semanticError('INVALID_CUTOFF_DATE');

  return {
    requestedEntity: brand == null ? { brand_id: brandId } : { brand },
    brand,
    brandId,
    dateFrom,
    dateTo,
    timeGrain,
    organizationScope,
    cutoffDate,
    cutoffMode,
  };
}

export async function resolveRvmBrandIdentity(parsed, query = null) {
  let execute = query;
  if (execute == null) {
    const { customGptDb } = await import('../custom-gpt/db.js');
    execute = customGptDb().query;
  }
  const rows = await execute(`SELECT marca_id,nombre_canonico
FROM marcas_master_v01
WHERE ($1::bigint IS NOT NULL AND marca_id=$1::bigint)
   OR ($2::text IS NOT NULL AND nombre_normalizado=master_norm($2::text))
ORDER BY marca_id`, [parsed.brandId, parsed.brand]);
  if (rows.length === 0) {
    return { entityType: 'BRAND', brandId: null, brandName: parsed.brand, identityStatus: 'UNRESOLVED' };
  }
  if (rows.length > 1) {
    return {
      entityType: 'BRAND', brandId: null, brandName: parsed.brand,
      identityStatus: 'AMBIGUOUS', candidateBrandIds: rows.map((row) => Number(row.marca_id)),
    };
  }
  return {
    entityType: 'BRAND', brandId: Number(rows[0].marca_id),
    brandName: rows[0].nombre_canonico, identityStatus: 'RESOLVED',
  };
}

function scope(parsed, temporalSemantics = null) {
  return {
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    timeGrain: parsed.timeGrain,
    organizationScope: parsed.organizationScope,
    ...(temporalSemantics ? { effectiveDateTo: temporalSemantics.effectiveDateTo } : {}),
  };
}

function identityFailure(parsed, entity) {
  const monthsRequested = enumeratePeriods(parsed.dateFrom, parsed.dateTo, parsed.timeGrain).length;
  const warning = entity.identityStatus === 'AMBIGUOUS'
    ? 'REQUESTED_BRAND_AMBIGUOUS' : 'REQUESTED_BRAND_UNRESOLVED';
  return {
    context: 'rvm_brand_share_trajectory_v01',
    version: '0.1',
    scope: scope(parsed),
    entity,
    coverage: { monthsRequested, monthsReturned: 0, monthsEvaluable: 0 },
    monthly: [],
    change: null,
    validation: { identityResolved: false, marketShareReconciles: false, ok: false },
    warnings: [warning],
    metadata: {
      metric: 'MARKET_SHARE',
      numerator: 'RVM entity VIN resolved by canonical brand_id',
      denominator: 'rvm_universe_v01 market units in the same period',
      organizationScopeSemantics: 'ALL is total market and is not a MASTER organization',
    },
  };
}

function sharesReconcile(series) {
  return series.every((row) => {
    if (row.denominator === 0) return row.value == null;
    return Math.abs(row.value - (row.numerator / row.denominator)) < 1e-12;
  });
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function overallChange(monthly) {
  const evaluable = monthly.filter((row) => row.marketShare != null);
  if (evaluable.length < 2) return null;
  const first = evaluable[0];
  const last = evaluable.at(-1);
  const delta = last.marketShare - first.marketShare;
  return {
    fromPeriod: first.period,
    toPeriod: last.period,
    shareChangePp: round(delta * 100),
    shareChangePct: first.marketShare === 0 ? null : round(delta / first.marketShare),
  };
}

export async function buildRvmBrandShareTrajectory(input = {}, dependencies = {}) {
  const parsed = parseRvmBrandShareTrajectoryInput(input);
  const resolveIdentity = dependencies.resolveIdentity ?? resolveRvmBrandIdentity;
  const entity = await resolveIdentity(parsed);
  if (entity.identityStatus !== 'RESOLVED') return identityFailure(parsed, entity);

  const buildLongitudinal = dependencies.buildLongitudinal ?? (async (value) => {
    const { buildRvmLongitudinal } = await import('../longitudinal/rvm.js');
    return buildRvmLongitudinal(value);
  });
  const longitudinal = await buildLongitudinal({
    metric: 'MARKET_SHARE',
    grain: 'BRAND',
    entity: { brand_id: entity.brandId },
    organization_scope: parsed.organizationScope,
    date_from: parsed.dateFrom,
    date_to: parsed.dateTo,
    time_grain: parsed.timeGrain,
    cutoff_mode: parsed.cutoffMode,
    ...(parsed.cutoffDate ? { cutoff_date: parsed.cutoffDate } : {}),
  });
  const monthly = longitudinal.series.map((row) => ({
    period: row.period,
    entityVin: Number(row.numerator),
    marketSize: Number(row.denominator),
    marketShare: row.value == null ? null : Number(row.value),
    shareChangePpFromPrevious: row.absoluteChange == null ? null : round(Number(row.absoluteChange) * 100),
    shareChangePctFromPrevious: row.pctChange == null ? null : round(Number(row.pctChange)),
  }));
  const monthsRequested = enumeratePeriods(parsed.dateFrom, parsed.dateTo, parsed.timeGrain).length;
  const marketShareReconciles = sharesReconcile(longitudinal.series);
  const monthsEvaluable = monthly.filter((row) => row.marketShare != null).length;
  const validation = {
    identityResolved: true,
    marketShareReconciles,
    monthsRequested,
    monthsReturned: monthly.length,
    monthsEvaluable,
    completeTemporalCoverage: monthly.length === monthsRequested,
  };
  validation.ok = marketShareReconciles && validation.completeTemporalCoverage;
  return {
    context: 'rvm_brand_share_trajectory_v01',
    version: '0.1',
    scope: scope(parsed, longitudinal.temporalSemantics),
    entity,
    coverage: {
      monthsRequested,
      monthsReturned: monthly.length,
      monthsEvaluable,
      dimensionCoverage: longitudinal.coverage.dimensionCoverage,
      organizationCoverage: longitudinal.coverage.organizationCoverage,
    },
    monthly,
    change: overallChange(monthly),
    validation,
    warnings: longitudinal.warnings,
    metadata: {
      metric: 'MARKET_SHARE',
      numerator: 'RVM entity VIN resolved by canonical brand_id',
      denominator: 'rvm_universe_v01 market units in the same period',
      denominatorExplicit: longitudinal.metadata.denominatorExplicit,
      organizationScopeSemantics: longitudinal.metadata.organizationScopeSemantics,
      identityAuthority: 'marcas_master_v01 exact canonical identity; rvm_universe_v01 certified membership',
    },
  };
}
