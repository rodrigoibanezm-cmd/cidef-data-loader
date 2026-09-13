const DEFAULT_PROJECTION = 'DEFAULT';
const CHANNELS = new Set(['EVIDENCE','CONTEXT']);

function projectionResult(data, coverage = null) {
  return { status: 'AVAILABLE', data, ...(coverage ? { coverage } : {}) };
}
function notEvaluable(reason_code, data = undefined) {
  return { status: 'NOT_EVALUABLE', reason_code, ...(data === undefined ? {} : { data }) };
}
function finite(value) { return Number.isFinite(Number(value)); }
function number(value) { return Number(value); }
function uniq(values) { return [...new Set((values ?? []).filter(Boolean))]; }
function monthKey(value) { return String(value ?? '').slice(0, 7); }
function inMonthRange(period, from, to) {
  const key = monthKey(period);
  return key >= monthKey(from) && key <= monthKey(to);
}
function enumerateMonths(dateFrom, dateTo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateFrom ?? '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateTo ?? ''))) return [];
  const out = [];
  const cursor = new Date(`${monthKey(dateFrom)}-01T00:00:00Z`);
  const end = monthKey(dateTo);
  while (cursor.toISOString().slice(0, 7) <= end) {
    out.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}
function addMonths(month, delta) {
  const [y,m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
function previousYearDate(date) {
  const [y,m,d] = String(date).split('-').map(Number);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
}
function previousYearPeriod(period) {
  return { date_from: previousYearDate(period.date_from), date_to: previousYearDate(period.date_to) };
}
function numericSeries(raw) {
  return Array.isArray(raw?.series)
    ? raw.series.filter((row) => row && typeof row.period === 'string' && finite(row.value))
      .map((row) => ({ period: String(row.period), value: number(row.value) }))
    : [];
}
function change(referenceValue, targetValue) {
  const absolute_change = targetValue - referenceValue;
  return { absolute_change, pct_change: referenceValue === 0 ? null : absolute_change / referenceValue };
}
function relevantDimensionCoverage(raw) {
  const rows = Array.isArray(raw?.coverage?.dimensionCoverage) ? raw.coverage.dimensionCoverage : [];
  const relevant = rows.find((row) => row?.dimension === raw?.grain) ?? null;
  if (!relevant) return null;
  return {
    dimension: relevant.dimension,
    resolved: finite(relevant.resolved) ? number(relevant.resolved) : undefined,
    unresolved: finite(relevant.unresolved) ? number(relevant.unresolved) : undefined,
    ambiguous: finite(relevant.ambiguous) ? number(relevant.ambiguous) : undefined,
    total: finite(relevant.total) ? number(relevant.total) : undefined,
  };
}
function compactObject(value) {
  if (Array.isArray(value)) return value.map(compactObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([,v]) => v !== undefined)
    .map(([k,v]) => [k, compactObject(v)]));
}
function materialWarnings(raw) {
  const values = Array.isArray(raw?.warnings) ? raw.warnings : [];
  return uniq(values.filter((warning) => /UNRESOLVED|AMBIGUOUS|INCOMPLETE|MISSING|WITHOUT|NOT_EVALUABLE|INCOMPATIBLE|CUTOFF|PARTIAL|COVERAGE|RECONCIL|NEGATIVE|VALIDATION FAILED/i.test(String(warning))));
}
function scopeFrom(plan) {
  return compactObject({
    organization_scope: plan?.scope_requirements?.organization_scope ?? undefined,
    commercial_universe: plan?.scope_requirements?.commercial_universe ?? undefined,
  });
}
function temporalSupportMaterial(plan, count) {
  if (count <= 1) return false;
  const family = plan?.question_family;
  const questionType = plan?.semantic_contract?.question_type;
  return questionType === 'CHANGE'
    || family === 'TEMPORAL_CONSTRUCTION'
    || family === 'COMMERCIAL_HEALTH'
    || family === 'COMPETITIVE_PERFORMANCE';
}
function cutoffIfMaterial(raw, plan) {
  const mode = raw?.temporalSemantics?.cutoffMode ?? plan?.temporal?.cutoff_mode ?? null;
  const through = raw?.temporalSemantics?.effectiveDateTo ?? raw?.as_of?.cutoff_date ?? null;
  const targetTo = plan?.temporal?.date_to ?? null;
  if (mode === 'SAME_DAY' || (through && targetTo && through < targetTo)) {
    return compactObject({ mode: mode ?? undefined, through: through ?? undefined });
  }
  return undefined;
}
function coverageForLongitudinal(raw) {
  const dimension = relevantDimensionCoverage(raw);
  const commercialValid = raw?.commercial_validation?.valid;
  const lastPeriodComplete = raw?.temporalSemantics?.lastPeriodComplete;
  return compactObject({
    status: commercialValid === false ? 'NOT_EVALUABLE' : 'AVAILABLE',
    identity: dimension ?? undefined,
    temporal: lastPeriodComplete == null ? undefined : { last_period_complete: Boolean(lastPeriodComplete) },
  });
}
function requireComparableLongitudinal(raw, plan) {
  if (!plan?.comparability?.common_cutoff_required) return null;
  const cutoffMode = raw?.temporalSemantics?.cutoffMode ?? null;
  if (cutoffMode !== 'SAME_DAY') return 'PUBLIC_CONTRACT_COMPARABILITY_FAILED';
  return null;
}
function resultPayload(metric, value, plan, extras = {}) {
  return compactObject({ metric, result: { value }, scope: scopeFrom(plan), ...extras });
}

function projectCurrentResult({ raw, plan }) {
  if (raw?.cidef_propio && finite(raw.cidef_propio.observed_to_date)) {
    const warnings = materialWarnings(raw);
    return projectionResult(resultPayload('VIN_SALES', number(raw.cidef_propio.observed_to_date), plan, {
      cutoff: cutoffIfMaterial(raw, plan),
      ...(warnings.length ? { warnings } : {}),
    }), compactObject({
      status: raw?.validation && Object.values(raw.validation).some((value) => value === false) ? 'NOT_EVALUABLE' : 'AVAILABLE',
      current_stores: finite(raw?.coverage?.current_cidef_stores) ? number(raw.coverage.current_cidef_stores) : undefined,
    }));
  }
  if (typeof raw?.metric !== 'string') return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  if (raw?.commercial_validation?.valid === false) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  const rows = numericSeries(raw).filter((row) => inMonthRange(row.period, plan.temporal.date_from, plan.temporal.date_to));
  if (!rows.length) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  const value = rows.reduce((sum, row) => sum + row.value, 0);
  const warnings = materialWarnings(raw);
  const extras = {
    ...(temporalSupportMaterial(plan, rows.length) ? { period_support: rows } : {}),
    cutoff: cutoffIfMaterial(raw, plan),
    ...(warnings.length ? { warnings } : {}),
  };
  return projectionResult(resultPayload(raw.metric, value, plan, extras), coverageForLongitudinal(raw));
}

function marketContext(raw) { return raw?.sharedContext ?? raw; }
function marketRows(context) {
  return Array.isArray(context?.monthly)
    ? context.monthly.filter((row) => row && typeof row.period === 'string'
      && finite(row.entityVin) && finite(row.marketSize))
      .map((row) => ({
        period: String(row.period), entity_units: number(row.entityVin), market_units: number(row.marketSize),
        share: row.marketShare == null ? null : number(row.marketShare),
      }))
    : [];
}
function marketComparability(context, plan) {
  if (!plan?.semantic_contract || plan.semantic_contract.comparison === 'NONE') return undefined;
  const validation = context?.validation ?? {};
  if (validation.completeTemporalCoverage === false || validation.marketShareReconciles === false || validation.ok === false) return null;
  return compactObject({ status: 'COMPARABLE', basis: plan?.temporal?.cutoff_mode ?? 'FULL_PERIOD' });
}
function projectMarketReference({ raw, plan, intent }) {
  const context = marketContext(raw);
  const rows = marketRows(context).filter((row) => inMonthRange(row.period, plan.temporal.date_from, plan.temporal.date_to));
  if (!rows.length) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  const comparability = marketComparability(context, plan);
  if (plan?.semantic_contract?.comparison !== 'NONE' && comparability == null) return notEvaluable('PUBLIC_CONTRACT_COMPARABILITY_FAILED');
  const entityUnits = rows.reduce((sum,row) => sum + row.entity_units, 0);
  const marketUnits = rows.reduce((sum,row) => sum + row.market_units, 0);
  const share = marketUnits === 0 ? null : entityUnits / marketUnits;
  const material = temporalSupportMaterial(plan, rows.length) || plan?.semantic_contract?.comparison !== 'NONE';
  const warnings = materialWarnings(context);
  const data = compactObject({
    metric: 'MARKET_SHARE',
    target: { type: intent?.entity?.type, name: intent?.entity?.value },
    result: { entity_units: entityUnits, market_units: marketUnits, share },
    reference: { type: 'TOTAL_MARKET' },
    ...(material ? { period_support: rows } : {}),
    ...(material && context?.change ? { change: {
      from_period: context.change.fromPeriod,
      to_period: context.change.toPeriod,
      share_change_pp: context.change.shareChangePp,
      share_change_pct: context.change.shareChangePct,
    } } : {}),
    ...(comparability ? { comparability } : {}),
    cutoff: cutoffIfMaterial({ temporalSemantics: { cutoffMode: context?.scope?.cutoffMode, effectiveDateTo: context?.scope?.effectiveDateTo } }, plan),
    scope: scopeFrom(plan),
    ...(warnings.length ? { warnings } : {}),
  });
  const coverage = compactObject({
    status: 'AVAILABLE',
    periods_requested: context?.coverage?.monthsRequested,
    periods_returned: context?.coverage?.monthsReturned,
    periods_evaluable: context?.coverage?.monthsEvaluable,
  });
  return projectionResult(data, coverage);
}

function sameSemanticValue(left, right) {
  return String(left ?? '').trim().toUpperCase() === String(right ?? '').trim().toUpperCase();
}
function projectMarketContext({ raw, intent }) {
  const context = marketContext(raw);
  if (!Array.isArray(context?.targets) || !Array.isArray(context?.universes) || !context.targets.length || !context.universes.length) {
    return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  }
  const observations = Array.isArray(context.targetObservations) ? context.targetObservations : [];
  const peerUniverses = context.universes.map((universe) => {
    const dims = universe?.key ?? {};
    const matching = observations.filter((obs) => sameSemanticValue(obs.segment, dims.segment)
      && sameSemanticValue(obs.type, dims.type) && sameSemanticValue(obs.fuel, dims.fuel));
    const targetUnits = matching.reduce((sum, row) => sum + (finite(row.units) ? number(row.units) : 0), 0);
    const marketSize = finite(universe.totalUnits) ? number(universe.totalUnits) : null;
    return compactObject({
      dimensions: { segment: dims.segment ?? undefined, type: dims.type ?? undefined, fuel: dims.fuel ?? undefined },
      market_size: marketSize ?? undefined,
      target_observation: {
        units: targetUnits,
        universe_share: marketSize && marketSize > 0 ? targetUnits / marketSize : null,
      },
    });
  });
  const warnings = materialWarnings(context);
  const identityCoverage = context?.validation?.identityCoverage;
  return projectionResult(compactObject({
    target: { type: intent?.entity?.type, name: intent?.entity?.value },
    peer_universes: peerUniverses,
    ...(warnings.length ? { warnings } : {}),
  }), compactObject({ status: 'AVAILABLE', identity_coverage: finite(identityCoverage) ? number(identityCoverage) : undefined }));
}

function referencePeriodFor(plan) {
  const target = { date_from: plan?.temporal?.date_from, date_to: plan?.temporal?.date_to };
  const comparison = plan?.semantic_contract?.comparison;
  if (comparison === 'YOY' || comparison === 'SAME_CUTOFF_YOY') {
    return { type: 'SAME_PERIOD_PREVIOUS_YEAR', period: previousYearPeriod(target) };
  }
  if (comparison === 'PREVIOUS_PERIOD') {
    const targetMonths = enumerateMonths(target.date_from, target.date_to);
    if (!targetMonths.length) return null;
    const end = addMonths(targetMonths[0], -1);
    const start = addMonths(end, -(targetMonths.length - 1));
    return { type: 'PREVIOUS_PERIOD', period: { date_from: `${start}-01`, date_to: `${end}-${String(new Date(Date.UTC(Number(end.slice(0,4)), Number(end.slice(5,7)), 0)).getUTCDate()).padStart(2,'0')}` } };
  }
  return null;
}
function projectHistoricalReference({ raw, plan }) {
  if (typeof raw?.metric !== 'string') return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  const comparisonFailure = requireComparableLongitudinal(raw, plan);
  if (comparisonFailure) return notEvaluable(comparisonFailure);
  const reference = referencePeriodFor(plan);
  if (!reference) return notEvaluable('PUBLIC_CONTRACT_COMPARABILITY_FAILED');
  const rows = numericSeries(raw).filter((row) => inMonthRange(row.period, reference.period.date_from, reference.period.date_to));
  const expected = enumerateMonths(reference.period.date_from, reference.period.date_to);
  if (!rows.length || expected.some((month) => !rows.some((row) => monthKey(row.period) === month))) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  const value = rows.reduce((sum,row) => sum + row.value, 0);
  const warnings = materialWarnings(raw);
  return projectionResult(compactObject({
    metric: raw.metric,
    reference: { type: reference.type, period: reference.period, value },
    comparability: { status: 'COMPARABLE', basis: plan?.temporal?.cutoff_mode ?? 'FULL_PERIOD' },
    ...(temporalSupportMaterial(plan, rows.length) ? { period_support: rows } : {}),
    ...(warnings.length ? { warnings } : {}),
  }), coverageForLongitudinal(raw));
}

function comparativeNotEvaluable(reason, proposition, targetPeriod, referencePeriod, raw) {
  return notEvaluable(reason, {
    proposition, comparison: 'YOY', target_period: targetPeriod,
    reference: { type: 'SAME_PERIOD_PREVIOUS_YEAR', period: referencePeriod },
    coverage: coverageForLongitudinal(raw), warnings: materialWarnings(raw),
  });
}
function projectComparativeTemporalSupport({ requirement, plan, raw }) {
  const proposition = requirement.proposition;
  const targetPeriod = { date_from: plan.temporal.date_from, date_to: plan.temporal.date_to };
  const referencePeriod = previousYearPeriod(targetPeriod);
  if ((plan.temporal.cutoff_mode ?? 'FULL_PERIOD') !== 'FULL_PERIOD' || raw?.temporalSemantics?.cutoffMode === 'SAME_DAY') return comparativeNotEvaluable('INCOMPATIBLE_CUTOFF', proposition, targetPeriod, referencePeriod, raw);
  if (raw?.metric !== 'VIN_SALES') return comparativeNotEvaluable('METRIC_MISMATCH', proposition, targetPeriod, referencePeriod, raw);
  const expectedUniverse = plan.scope_requirements?.commercial_universe ?? null;
  const actualUniverse = raw?.commercial_scope?.universe ?? raw?.commercial_scope?.commercial_universe ?? raw?.metadata?.commercialScope ?? null;
  if (expectedUniverse && actualUniverse && expectedUniverse !== actualUniverse) return comparativeNotEvaluable('COMMERCIAL_UNIVERSE_MISMATCH', proposition, targetPeriod, referencePeriod, raw);
  if (raw?.commercial_validation?.valid === false) return comparativeNotEvaluable('COMMERCIAL_SCOPE_INVALID', proposition, targetPeriod, referencePeriod, raw);
  if (raw?.temporalSemantics?.lastPeriodComplete === false) return comparativeNotEvaluable('TARGET_PERIOD_INCOMPLETE', proposition, targetPeriod, referencePeriod, raw);
  const dimension = relevantDimensionCoverage(raw);
  if (dimension && (number(dimension.unresolved ?? 0) > 0 || number(dimension.ambiguous ?? 0) > 0)) return comparativeNotEvaluable('IDENTITY_COVERAGE_INVALID', proposition, targetPeriod, referencePeriod, raw);
  const rows = numericSeries(raw), byPeriod = new Map(rows.map((row) => [monthKey(row.period), row.value]));
  const targetMonths = enumerateMonths(targetPeriod.date_from, targetPeriod.date_to);
  const referenceMonths = enumerateMonths(referencePeriod.date_from, referencePeriod.date_to);
  if (targetMonths.length !== referenceMonths.length || targetMonths.some((month,index) => addMonths(referenceMonths[index],12) !== month)) return comparativeNotEvaluable('INCOMPATIBLE_TEMPORAL_SHAPE', proposition, targetPeriod, referencePeriod, raw);
  if (targetMonths.some((month) => !byPeriod.has(month))) return comparativeNotEvaluable('TARGET_PERIOD_DATA_MISSING', proposition, targetPeriod, referencePeriod, raw);
  if (referenceMonths.some((month) => !byPeriod.has(month))) return comparativeNotEvaluable('REFERENCE_PERIOD_DATA_MISSING', proposition, targetPeriod, referencePeriod, raw);
  const targetValue = targetMonths.reduce((sum,month) => sum + byPeriod.get(month), 0);
  const referenceValue = referenceMonths.reduce((sum,month) => sum + byPeriod.get(month), 0);
  const aggregate = { target_value: targetValue, reference_value: referenceValue, ...change(referenceValue, targetValue) };
  const data = {
    proposition_type: proposition.type,
    comparison: proposition.comparison,
    target_period: targetPeriod,
    reference: { type: proposition.reference.type, period: referencePeriod },
    aggregate,
    coverage: {
      dimension,
      commercial: raw?.commercial_coverage ?? null,
      denominator_commercial: raw?.denominator_commercial_coverage ?? null,
      commercial_validation: raw?.commercial_validation ?? null,
    },
    warnings: Array.isArray(raw?.warnings) ? raw.warnings : [],
  };
  if (proposition.evaluation.mode === 'AGGREGATE_AND_MONTHLY_SUPPORT') {
    const monthly_support = targetMonths.map((targetMonth,index) => {
      const referenceMonth = referenceMonths[index], target = byPeriod.get(targetMonth), reference = byPeriod.get(referenceMonth);
      return { target_period: targetMonth, reference_period: referenceMonth, target_value: target, reference_value: reference, ...change(reference,target) };
    });
    data.monthly_support = monthly_support;
    data.direction_counts = {
      negative_count: monthly_support.filter((row) => row.absolute_change < 0).length,
      positive_count: monthly_support.filter((row) => row.absolute_change > 0).length,
      unchanged_count: monthly_support.filter((row) => row.absolute_change === 0).length,
    };
  }
  return projectionResult(data);
}

function projectCloseExpectation({ raw, plan }) {
  const company = raw?.cidef_propio;
  if (!company || !finite(company.observed_to_date)) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  if (company.forecast_status !== 'EVALUABLE' || !finite(company.forecast_close)) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  const warnings = materialWarnings(raw);
  return projectionResult(compactObject({
    metric: 'VIN_SALES', observed_to_date: number(company.observed_to_date), forecast_close: number(company.forecast_close),
    is_predictable: company.is_predictable, predictability_day: company.predictability_day,
    cutoff: cutoffIfMaterial(raw, plan), scope: scopeFrom(plan), ...(warnings.length ? { warnings } : {}),
  }), { status: 'AVAILABLE' });
}
function projectChangeContribution({ raw }) {
  if (!raw?.cidef || !Array.isArray(raw?.stores)) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  const stores = raw.stores.map((row) => compactObject({
    store: row.sucursal ?? row.store ?? row.sucursal_nombre,
    period_a_sales: row.sales_period_a ?? row.period_a_sales,
    period_b_sales: row.sales_period_b ?? row.period_b_sales,
    delta_sales: row.delta_sales,
    contribution_pct: row.contribution_pct ?? row.contribution_share_pct,
  })).filter((row) => row.store != null);
  return projectionResult(compactObject({
    company: { period_a_sales: raw.cidef.period_a_sales, period_b_sales: raw.cidef.period_b_sales, delta_sales: raw.cidef.delta_sales },
    stores,
    warnings: materialWarnings(raw),
  }), { status: 'AVAILABLE' });
}
function projectCrmSignal({ raw }) {
  if (!raw?.headline || !raw?.context_population) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  const qualityWarnings = Array.isArray(raw?.quality?.warnings) ? raw.quality.warnings : [];
  return projectionResult(compactObject({
    population: { count: raw.context_population.count, date_axis: raw.context_population.selection_date_axis },
    headline: {
      leads_assigned: raw.headline.leads_assigned?.count,
      leads_created: raw.headline.leads_created?.count,
      managed: raw.headline.managed?.value,
      unmanaged: raw.headline.unmanaged?.value,
      sold: raw.headline.sold?.count,
      not_sold: raw.headline.not_sold?.count,
      conversion_rate: raw.headline.conversion_rate?.value,
    },
    warnings: uniq(qualityWarnings.filter((warning) => /UNRESOLVED|AMBIGUOUS|INCOMPLETE|COVERAGE|HISTORY/i.test(String(warning)))),
  }), { status: 'AVAILABLE' });
}
function projectSalesContext({ raw }) {
  if (!raw?.commercial_scope || !raw?.coverage) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  return projectionResult(compactObject({
    commercial_universe: raw.commercial_scope.universe,
    recognized_sales: raw.coverage.recognized_sales,
    included_sales: raw.coverage.included_sales,
    unresolved_channel: raw.coverage.unresolved_channel,
    unresolved_destination: raw.coverage.unresolved_destination,
  }), compactObject({ status: raw?.validation?.valid === false ? 'NOT_EVALUABLE' : 'AVAILABLE' }));
}
function projectCrmContext({ raw }) { return projectCrmSignal({ raw }); }

const REGISTRY = new Map();
function key(channel, type, propositionType = DEFAULT_PROJECTION) { return `${channel}:${type}:${propositionType}`; }
function register(channel, type, projector, propositionType = DEFAULT_PROJECTION) {
  REGISTRY.set(key(channel,type,propositionType), projector);
}
register('EVIDENCE','CURRENT_RESULT',projectCurrentResult);
register('EVIDENCE','MARKET_REFERENCE',projectMarketReference);
register('EVIDENCE','HISTORICAL_REFERENCE',projectHistoricalReference);
register('EVIDENCE','HISTORICAL_REFERENCE',projectComparativeTemporalSupport,'COMPARATIVE_TEMPORAL_SUPPORT');
register('EVIDENCE','CLOSE_EXPECTATION',projectCloseExpectation);
register('EVIDENCE','CHANGE_CONTRIBUTION',projectChangeContribution);
register('EVIDENCE','CRM_CONTEXT_SIGNAL',projectCrmSignal);
register('CONTEXT','MARKET_CONTEXT',projectMarketContext);
register('CONTEXT','SALES_CONTEXT',projectSalesContext);
register('CONTEXT','CRM_CONTEXT',projectCrmContext);

export function projectPublicRequirement({ channel, requirement, plan, intent, raw }) {
  const normalizedChannel = String(channel ?? '').toUpperCase();
  if (!CHANNELS.has(normalizedChannel) || !requirement?.type) return notEvaluable('PUBLIC_PROJECTION_NOT_REGISTERED');
  const propositionType = requirement.proposition?.type ?? DEFAULT_PROJECTION;
  const projector = REGISTRY.get(key(normalizedChannel, requirement.type, propositionType));
  if (!projector) {
    if (requirement.proposition != null && REGISTRY.has(key(normalizedChannel, requirement.type, DEFAULT_PROJECTION))) {
      return notEvaluable('PUBLIC_PROPOSITION_NOT_SUPPORTED');
    }
    return notEvaluable('PUBLIC_PROJECTION_NOT_REGISTERED');
  }
  try {
    const projected = projector({ requirement, plan, intent, raw });
    if (!projected || !['AVAILABLE','NOT_EVALUABLE'].includes(projected.status)) return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
    return projected;
  } catch {
    return notEvaluable('PUBLIC_CONTRACT_INSUFFICIENT_INPUT');
  }
}

export function hasPublicProjection(channel, type, propositionType = DEFAULT_PROJECTION) {
  return REGISTRY.has(key(String(channel ?? '').toUpperCase(), type, propositionType));
}
