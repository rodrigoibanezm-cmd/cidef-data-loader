import { customGptDb } from '../custom-gpt/db.js';
import { assertVentasCrmCommercialDomainCompatibility } from '../longitudinal/commercial-domain-compatibility.js';
import { semanticError } from '../longitudinal/common.js';
import { crmLongitudinalContextV01 } from './crm-longitudinal-context-v01.js';
import { rvmLongitudinalContextV01 } from './rvm-longitudinal-context-v01.js';
import { ventasLongitudinalContextV01 } from './ventas-longitudinal-context-v01.js';

export const ENGINE_NAME = 'vin_growth_diagnostic_v01';
export const ENGINE_VERSION = '0.1';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALLOWED_INPUTS = new Set(['brand_id', 'store_id', 'current_month']);

export const Direction = Object.freeze({
  POSITIVE: 'POSITIVE',
  NEGATIVE: 'NEGATIVE',
  FLAT: 'FLAT',
  NOT_EVALUABLE: 'NOT_EVALUABLE',
});
export const PctStatus = Object.freeze({
  EVALUABLE: 'EVALUABLE',
  NOT_EVALUABLE_ZERO_BASE: 'NOT_EVALUABLE_ZERO_BASE',
  NOT_EVALUABLE_SOURCE: 'NOT_EVALUABLE_SOURCE',
});
export const ActivityTransition = Object.freeze({
  NEW_ACTIVITY: 'NEW_ACTIVITY',
  CEASED_ACTIVITY: 'CEASED_ACTIVITY',
  CONTINUING_ACTIVITY: 'CONTINUING_ACTIVITY',
  NO_ACTIVITY: 'NO_ACTIVITY',
});
export const DiagnosticRelation = Object.freeze({
  SAME_DIRECTION: 'SAME_DIRECTION',
  OPPOSITE_DIRECTION: 'OPPOSITE_DIRECTION',
  STORE_MOVED_CONTEXT_FLAT: 'STORE_MOVED_CONTEXT_FLAT',
  STORE_FLAT_CONTEXT_MOVED: 'STORE_FLAT_CONTEXT_MOVED',
  BOTH_FLAT: 'BOTH_FLAT',
  NOT_EVALUABLE: 'NOT_EVALUABLE',
});

function numericId(value, code) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw semanticError(code);
  return id;
}

export function parseVinGrowthDiagnosticInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw semanticError('INVALID_INPUT');
  const unsupported = Object.keys(input).find((key) => !ALLOWED_INPUTS.has(key));
  if (unsupported) throw semanticError('UNSUPPORTED_INPUT_FIELD', unsupported);
  const brandId = numericId(input.brand_id, 'BRAND_NOT_RESOLVED');
  const storeId = numericId(input.store_id, 'STORE_NOT_RESOLVED');
  const currentMonth = String(input.current_month || '');
  if (!MONTH_RE.test(currentMonth)) throw semanticError('INVALID_PERIOD');
  return { brandId, storeId, currentMonth };
}

export function previousCalendarMonth(month) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export function monthStart(month) { return `${month}-01`; }
export function monthEnd(month) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export function directionFromDelta(delta, evaluable = true) {
  if (!evaluable || delta == null || !Number.isFinite(Number(delta))) return Direction.NOT_EVALUABLE;
  if (Number(delta) > 0) return Direction.POSITIVE;
  if (Number(delta) < 0) return Direction.NEGATIVE;
  return Direction.FLAT;
}

export function percentageChange(current, previous, sourceEvaluable = true) {
  if (!sourceEvaluable || current == null || previous == null) {
    return { value: null, status: PctStatus.NOT_EVALUABLE_SOURCE };
  }
  if (Number(previous) === 0) {
    return { value: null, status: PctStatus.NOT_EVALUABLE_ZERO_BASE };
  }
  return {
    value: ((Number(current) - Number(previous)) / Number(previous)) * 100,
    status: PctStatus.EVALUABLE,
  };
}

export function activityTransition(current, previous) {
  if (Number(previous) === 0 && Number(current) > 0) return ActivityTransition.NEW_ACTIVITY;
  if (Number(previous) > 0 && Number(current) === 0) return ActivityTransition.CEASED_ACTIVITY;
  if (Number(previous) > 0 && Number(current) > 0) return ActivityTransition.CONTINUING_ACTIVITY;
  return ActivityTransition.NO_ACTIVITY;
}

export function diagnosticRelation(storeDirection, contextDirection) {
  if (storeDirection === Direction.NOT_EVALUABLE || contextDirection === Direction.NOT_EVALUABLE) {
    return DiagnosticRelation.NOT_EVALUABLE;
  }
  if (storeDirection === Direction.FLAT && contextDirection === Direction.FLAT) return DiagnosticRelation.BOTH_FLAT;
  if (storeDirection === Direction.FLAT) return DiagnosticRelation.STORE_FLAT_CONTEXT_MOVED;
  if (contextDirection === Direction.FLAT) return DiagnosticRelation.STORE_MOVED_CONTEXT_FLAT;
  return storeDirection === contextDirection ? DiagnosticRelation.SAME_DIRECTION : DiagnosticRelation.OPPOSITE_DIRECTION;
}

function point(series, period) {
  return Array.isArray(series) ? series.find((row) => row.period === period) ?? null : null;
}

function hasNoCoverage(result) {
  return !result || result.warnings?.includes('NO_OBSERVED_EVIDENCE_IN_RANGE');
}

function limitationList(...results) {
  return [...new Set(results.flatMap((result) => result?.warnings || [])
    .filter((warning) => warning === 'CRM_NO_HISTORICAL_STATE_SNAPSHOTS'))];
}

function relation(storeDirection, contextDirection) {
  return {
    store_direction: storeDirection,
    context_direction: contextDirection,
    relation: diagnosticRelation(storeDirection, contextDirection),
  };
}

function assertReconciled(condition, detail) {
  if (!condition) throw semanticError('INSUFFICIENT_CORE_DATA', detail);
}

function requireNonNegative(value, detail) {
  assertReconciled(Number.isFinite(value) && value >= 0, detail);
}

export async function loadVinGrowthCanonicalScope(db, { brandId, storeId }) {
  const [brands, stores] = await Promise.all([
    db.query('SELECT marca_id,nombre_canonico FROM marcas_master_v01 WHERE marca_id=$1', [brandId]),
    db.query('SELECT sucursal_id,nombre_canonico,tipo_canal FROM sucursales_master WHERE sucursal_id=$1', [storeId]),
  ]);
  if (!brands.length) throw semanticError('BRAND_NOT_RESOLVED');
  if (!stores.length) throw semanticError('STORE_NOT_RESOLVED');
  if (String(stores[0].tipo_canal || '').toUpperCase() !== 'CIDEF') throw semanticError('STORE_NOT_OWN_STORE');
  return {
    brandId,
    brandName: brands[0].nombre_canonico,
    storeId,
    storeName: stores[0].nombre_canonico,
    commercialUniverse: 'OWN_STORES',
  };
}

function buildStoreAndInternal(ventas, scope, periods) {
  if (!ventas || ventas.commercial_scope?.universe !== 'OWN_STORES') {
    throw semanticError('DOMAIN_MISMATCH', 'VENTAS must use OWN_STORES');
  }
  if (hasNoCoverage(ventas)) throw semanticError('INSUFFICIENT_CORE_DATA');
  if (!ventas.temporalSemantics?.lastPeriodComplete) throw semanticError('INVALID_PERIOD');
  const totalCurrent = point(ventas.series, periods.currentMonth);
  const totalPrevious = point(ventas.series, periods.previousMonth);
  if (!totalCurrent || !totalPrevious || totalCurrent.value == null || totalPrevious.value == null) {
    throw semanticError('INSUFFICIENT_CORE_DATA');
  }
  const storeBucket = (ventas.seriesByBreakdown || []).find((bucket) => String(bucket.key) === String(scope.storeId));
  const storeCurrentPoint = point(storeBucket?.series, periods.currentMonth);
  const storePreviousPoint = point(storeBucket?.series, periods.previousMonth);
  const storeCurrent = storeCurrentPoint?.value == null ? 0 : Number(storeCurrentPoint.value);
  const storePrevious = storePreviousPoint?.value == null ? 0 : Number(storePreviousPoint.value);
  const totalCurrentValue = Number(totalCurrent.value);
  const totalPreviousValue = Number(totalPrevious.value);
  requireNonNegative(storeCurrent, 'store current VIN invalid');
  requireNonNegative(storePrevious, 'store previous VIN invalid');
  requireNonNegative(totalCurrentValue, 'current denominator invalid');
  requireNonNegative(totalPreviousValue, 'previous denominator invalid');
  assertReconciled(storeCurrent <= totalCurrentValue, 'store current VIN exceeds own-store brand total');
  assertReconciled(storePrevious <= totalPreviousValue, 'store previous VIN exceeds own-store brand total');

  const storeDelta = storeCurrent - storePrevious;
  const storePct = percentageChange(storeCurrent, storePrevious);
  const storeDirection = directionFromDelta(storeDelta);
  const storeResult = {
    store_vin_t: storeCurrent,
    store_vin_t_minus_1: storePrevious,
    store_vin_delta: storeDelta,
    store_vin_delta_pct: storePct.value,
    store_vin_delta_pct_status: storePct.status,
    direction: storeDirection,
    activity_transition: activityTransition(storeCurrent, storePrevious),
  };

  const currentShareEvaluable = totalCurrentValue > 0;
  const previousShareEvaluable = totalPreviousValue > 0;
  const currentShare = currentShareEvaluable ? storeCurrent / totalCurrentValue : null;
  const previousShare = previousShareEvaluable ? storePrevious / totalPreviousValue : null;
  if (currentShareEvaluable) assertReconciled(currentShare >= 0 && currentShare <= 1, 'current internal share outside [0,1]');
  if (previousShareEvaluable) assertReconciled(previousShare >= 0 && previousShare <= 1, 'previous internal share outside [0,1]');
  const internalEvaluable = currentShareEvaluable && previousShareEvaluable;
  const internalDelta = internalEvaluable ? currentShare - previousShare : null;
  const internalDirection = directionFromDelta(internalDelta, internalEvaluable);

  return {
    storeResult,
    internalPosition: {
      evaluable: internalEvaluable,
      store_brand_vin_t: storeCurrent,
      total_own_stores_brand_vin_t: totalCurrentValue,
      internal_share_t: currentShare,
      store_brand_vin_t_minus_1: storePrevious,
      total_own_stores_brand_vin_t_minus_1: totalPreviousValue,
      internal_share_t_minus_1: previousShare,
      internal_share_delta: internalDelta,
      direction: internalDirection,
    },
  };
}

function buildRvmContext(rvm, periods) {
  const sourceEvaluable = !hasNoCoverage(rvm);
  const current = point(rvm?.series, periods.currentMonth);
  const previous = point(rvm?.series, periods.previousMonth);
  const evaluable = sourceEvaluable && current?.value != null && previous?.value != null;
  const currentValue = evaluable ? Number(current.value) : null;
  const previousValue = evaluable ? Number(previous.value) : null;
  const delta = evaluable ? currentValue - previousValue : null;
  const pct = percentageChange(currentValue, previousValue, evaluable);
  return {
    evaluable,
    brand_rvm_vin_t: currentValue,
    brand_rvm_vin_t_minus_1: previousValue,
    brand_rvm_vin_delta: delta,
    brand_rvm_vin_delta_pct: pct.value,
    brand_rvm_vin_delta_pct_status: pct.status,
    direction: directionFromDelta(delta, evaluable),
  };
}

function buildCrmConversion(crm, periods) {
  const sourceEvaluable = !hasNoCoverage(crm);
  const current = point(crm?.series, periods.currentMonth);
  const previous = point(crm?.series, periods.previousMonth);
  const currentNumerator = current?.numerator == null ? null : Number(current.numerator);
  const currentDenominator = current?.denominator == null ? null : Number(current.denominator);
  const previousNumerator = previous?.numerator == null ? null : Number(previous.numerator);
  const previousDenominator = previous?.denominator == null ? null : Number(previous.denominator);
  if (currentNumerator != null && currentDenominator != null && currentNumerator > currentDenominator) {
    throw semanticError('INSUFFICIENT_CORE_DATA', 'CRM conversion current numerator exceeds denominator');
  }
  if (previousNumerator != null && previousDenominator != null && previousNumerator > previousDenominator) {
    throw semanticError('INSUFFICIENT_CORE_DATA', 'CRM conversion previous numerator exceeds denominator');
  }
  const currentEvaluable = sourceEvaluable && currentNumerator != null && currentDenominator > 0 && current?.value != null;
  const previousEvaluable = sourceEvaluable && previousNumerator != null && previousDenominator > 0 && previous?.value != null;
  if (currentEvaluable) assertReconciled(Number(current.value) === currentNumerator / currentDenominator, 'CRM conversion current does not reconcile');
  if (previousEvaluable) assertReconciled(Number(previous.value) === previousNumerator / previousDenominator, 'CRM conversion previous does not reconcile');
  const evaluable = currentEvaluable && previousEvaluable;
  const currentValue = currentEvaluable ? Number(current.value) : null;
  const previousValue = previousEvaluable ? Number(previous.value) : null;
  const delta = evaluable ? currentValue - previousValue : null;
  return {
    evaluable,
    crm_conversion_t: currentValue,
    crm_conversion_numerator_t: currentNumerator,
    crm_conversion_denominator_t: currentDenominator,
    crm_conversion_t_minus_1: previousValue,
    crm_conversion_numerator_t_minus_1: previousNumerator,
    crm_conversion_denominator_t_minus_1: previousDenominator,
    crm_conversion_delta: delta,
    direction: directionFromDelta(delta, evaluable),
  };
}

function buildCrmSold(crm, periods) {
  const sourceEvaluable = !hasNoCoverage(crm);
  const current = point(crm?.series, periods.currentMonth);
  const previous = point(crm?.series, periods.previousMonth);
  const evaluable = sourceEvaluable && current?.value != null && previous?.value != null;
  const currentValue = evaluable ? Number(current.value) : null;
  const previousValue = evaluable ? Number(previous.value) : null;
  const delta = evaluable ? currentValue - previousValue : null;
  return {
    evaluable,
    crm_sold_t: currentValue,
    crm_sold_t_minus_1: previousValue,
    crm_sold_delta: delta,
    direction: directionFromDelta(delta, evaluable),
  };
}

export function assembleVinGrowthDiagnostic({ scope, periods, ventas, rvm, crmConversion, crmSold }) {
  const { storeResult, internalPosition } = buildStoreAndInternal(ventas, scope, periods);
  const rvmContext = buildRvmContext(rvm, periods);
  const conversion = buildCrmConversion(crmConversion, periods);
  const sold = buildCrmSold(crmSold, periods);
  const flags = {
    ventas_evaluable: true,
    rvm_evaluable: rvmContext.evaluable,
    internal_share_evaluable: internalPosition.evaluable,
    crm_conversion_evaluable: conversion.evaluable,
    crm_sold_evaluable: sold.evaluable,
  };
  const notEvaluable = Object.entries(flags).filter(([, value]) => !value).map(([key]) => key);
  const limitations = limitationList(crmConversion, crmSold);
  const complete = Object.values(flags).every(Boolean);
  return {
    motor: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: complete ? 'COMPLETE' : 'PARTIAL',
    scope: {
      commercial_universe: 'OWN_STORES',
      store_id: scope.storeId,
      brand_id: scope.brandId,
    },
    period: {
      current_month: periods.currentMonth,
      previous_month: periods.previousMonth,
      comparison: 'MONTH_OVER_MONTH',
      current_period_evaluable: true,
      previous_period_evaluable: true,
    },
    store_result: storeResult,
    rvm_context: rvmContext,
    internal_position: internalPosition,
    crm_context: { conversion, sold },
    diagnostic_relations: {
      store_vs_rvm: relation(storeResult.direction, rvmContext.direction),
      store_vs_internal_share: relation(storeResult.direction, internalPosition.direction),
      store_vs_crm_conversion: relation(storeResult.direction, conversion.direction),
      store_vs_crm_sold: relation(storeResult.direction, sold.direction),
    },
    evidence: { ...flags, not_evaluable: notEvaluable, limitations },
    warnings: [],
  };
}

function defaultDependencies() {
  return {
    db: customGptDb(),
    ventas: ventasLongitudinalContextV01,
    rvm: rvmLongitudinalContextV01,
    crm: crmLongitudinalContextV01,
  };
}

export async function vinGrowthDiagnosticV01(input = {}, dependencies = null) {
  const parsed = parseVinGrowthDiagnosticInput(input);
  const deps = dependencies || defaultDependencies();
  const scope = await loadVinGrowthCanonicalScope(deps.db, parsed);
  const previousMonth = previousCalendarMonth(parsed.currentMonth);
  const periods = { currentMonth: parsed.currentMonth, previousMonth };
  const dateFrom = monthStart(previousMonth);
  const dateTo = monthEnd(parsed.currentMonth);
  const common = { date_from: dateFrom, date_to: dateTo, time_grain: 'MONTH', cutoff_mode: 'FULL_PERIOD' };

  const ventasInput = {
    commercial_universe: 'OWN_STORES',
    metric: 'VIN_SALES',
    grain: 'TOTAL',
    filters: { brand_id: String(scope.brandId) },
    breakdown: 'STORE',
    ...common,
  };
  const rvmInput = {
    metric: 'ENTITY_VIN',
    grain: 'BRAND',
    filters: {},
    entity: { brand_id: String(scope.brandId) },
    ...common,
  };
  const crmBase = {
    commercial_universe: 'OWN_STORES',
    grain: 'TOTAL',
    filters: { brand: scope.brandName, store_id: String(scope.storeId) },
    mode: 'COHORT',
    cohort_axis: 'CREATED_AT',
    ...common,
  };

  const [ventas, rvm, crmConversion, crmSold] = await Promise.all([
    deps.ventas(ventasInput),
    deps.rvm(rvmInput),
    deps.crm({ ...crmBase, metric: 'CONVERSION_RATE' }),
    deps.crm({ ...crmBase, metric: 'SOLD' }),
  ]);
  assertVentasCrmCommercialDomainCompatibility(
    ventas?.commercial_scope?.universe,
    crmConversion?.commercial_scope?.universe,
  );
  assertVentasCrmCommercialDomainCompatibility(
    ventas?.commercial_scope?.universe,
    crmSold?.commercial_scope?.universe,
  );
  return assembleVinGrowthDiagnostic({ scope, periods, ventas, rvm, crmConversion, crmSold });
}

export const run = vinGrowthDiagnosticV01;
