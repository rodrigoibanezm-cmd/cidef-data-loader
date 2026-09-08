import { calculateExpectedMonthlyCandidates } from '../motors/expected-monthly-candidates-v01.js';
import { calculateExpectedMonthlyBacktest } from '../motors/expected-monthly-backtest-v01.js';
import { calculateExpectedMonthlyStability } from '../motors/expected-monthly-stability-v01.js';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function identity(context, dimension) {
  const value = context?.scope_identity?.[dimension];
  return value?.status === 'RESOLVED' ? value : {
    id: value?.id ?? null,
    name: null,
    status: 'UNRESOLVED',
    evidence_events: value?.evidence_events ?? 0,
  };
}

function contextsCompatible(observedContext, referenceContext, parsed) {
  return [observedContext, referenceContext].every((context) =>
    context?.commercial_universe === 'OWN_STORES'
      && context?.grain === 'STORE_BRAND_MONTH'
      && context?.metric === 'VIN_SALES'
      && Number(context?.store_id) === parsed.storeId
      && Number(context?.brand_id) === parsed.brandId)
    && observedContext?.cutoff_month === parsed.month
    && referenceContext?.cutoff_month === parsed.referenceCutoffMonth;
}

function validWinner(backtest, candidates) {
  if (backtest?.status !== 'ok' || backtest?.validation?.has_evaluable_months !== true) return null;
  const method = backtest.winner;
  const ranking = backtest.ranking?.find((row) => row.candidate === method);
  const candidate = candidates?.candidates?.find((row) => row.method === method);
  if (!method || !ranking || ranking.months_evaluated <= 0) return null;
  if (!Number.isFinite(ranking.wape) || !Number.isFinite(ranking.mae)) return null;
  if (candidate?.evaluability !== 'EVALUABLE' || !Number.isFinite(candidate.expected_vin)) return null;
  return { method, vin: candidate.expected_vin, ranking, candidate };
}

function observedValue(context, month, identitiesResolved) {
  const row = context?.monthlySales?.find((item) => item.month === month);
  if (row && Number.isFinite(row.sales)) return { vin: row.sales, status: 'OBSERVED' };
  if (identitiesResolved && context?.validation?.ok === true && context?.cutoff_month === month) {
    return { vin: 0, status: 'CONFIRMED_ZERO' };
  }
  return { vin: null, status: 'NOT_AVAILABLE' };
}

export function calculateVinGap({ observedContext, referenceContext }, parsed) {
  const store = identity(observedContext, 'store');
  const brand = identity(observedContext, 'brand');
  const identitiesResolved = store.status === 'RESOLVED' && brand.status === 'RESOLVED';
  const observed = observedValue(observedContext, parsed.month, identitiesResolved);
  const scopeCompatible = contextsCompatible(observedContext, referenceContext, parsed);

  const candidates = scopeCompatible ? calculateExpectedMonthlyCandidates(referenceContext, {
    cutoff_month: parsed.referenceCutoffMonth,
    target_month: parsed.month,
  }) : null;
  const backtest = scopeCompatible ? calculateExpectedMonthlyBacktest(referenceContext) : null;
  const stability = scopeCompatible ? calculateExpectedMonthlyStability(referenceContext) : null;
  const winner = validWinner(backtest, candidates);

  const reasons = [];
  if (parsed.commercialUniverse !== 'OWN_STORES') reasons.push('UNSUPPORTED_SCOPE');
  if (parsed.grain !== 'STORE_BRAND_MONTH') reasons.push('UNSUPPORTED_GRAIN');
  if (store.status !== 'RESOLVED') reasons.push('STORE_NOT_RESOLVED');
  if (brand.status !== 'RESOLVED') reasons.push('BRAND_NOT_RESOLVED');
  if (!parsed.periodClosed) reasons.push('PERIOD_NOT_CLOSED');
  if (!scopeCompatible) reasons.push('REFERENCE_NOT_COMPATIBLE');
  if (observed.vin == null && identitiesResolved) reasons.push('OBSERVED_NOT_AVAILABLE');
  if (scopeCompatible && !winner) {
    const insufficient = backtest?.validation?.has_evaluable_months !== true
      || candidates?.candidates?.every((row) => row.evaluability !== 'EVALUABLE');
    reasons.push(insufficient ? 'INSUFFICIENT_HISTORY' : 'REFERENCE_NOT_AVAILABLE');
  }

  const evaluable = reasons.length === 0;
  const gapVin = evaluable ? winner.vin - observed.vin : null;
  const warnings = unique([
    ...(observedContext?.warnings ?? []),
    ...(referenceContext?.warnings ?? []),
    ...(candidates?.warnings ?? []),
    ...(backtest?.warnings ?? []),
    ...(stability?.warnings ?? []),
    ...(!parsed.periodClosed ? ['PERIOD_NOT_CLOSED'] : []),
    ...(!winner ? ['REFERENCE_NOT_AVAILABLE'] : []),
  ]);

  return {
    metadata: {
      capability: 'vin_gap_v01',
      version: '0.1',
      domain: 'VENTAS',
      unit: 'VIN',
      interpretation: 'GAP_ONLY',
      semantics: 'Arithmetic difference only; it is not opportunity, capturability, risk, deterioration, causality, or a recommendation.',
    },
    scope: {
      commercial_universe: parsed.commercialUniverse,
      grain: parsed.grain,
      store: { id: parsed.storeId, name: store.name },
      brand: { id: parsed.brandId, name: brand.name },
      month: parsed.month,
    },
    observed: {
      vin: observed.vin,
      source: 'ventas_universe_v01.analytical_events',
      coverage: { status: observed.status, cutoff_month: observedContext?.cutoff_month ?? null },
    },
    reference: {
      vin: evaluable ? winner.vin : null,
      method: evaluable ? winner.method : null,
      source: 'expected_monthly_candidates_v01 + expected_monthly_backtest_v01',
      definition: evaluable ? winner.candidate.definition : null,
      cutoff_month: parsed.referenceCutoffMonth,
      required_history_months: evaluable ? winner.candidate.required_history_months : null,
      evaluability: {
        status: evaluable ? 'EVALUABLE' : 'NOT_EVALUABLE',
        reasons: evaluable ? [] : unique(reasons.filter((reason) =>
          reason.includes('REFERENCE') || reason === 'INSUFFICIENT_HISTORY' || reason === 'PERIOD_NOT_CLOSED')),
      },
      stability,
      coverage: {
        candidates: candidates?.coverage ?? null,
        backtest: backtest?.coverage ?? null,
        winner_ranking: winner?.ranking ?? null,
      },
    },
    gap: { vin: gapVin, sign_convention: 'REFERENCE_MINUS_OBSERVED' },
    evaluability: { status: evaluable ? 'EVALUABLE' : 'NOT_EVALUABLE', reasons: unique(reasons) },
    coverage: {
      commercial_universe: observedContext?.commercial_coverage ?? null,
      store_identity: store,
      brand_identity: brand,
      temporal: { month: parsed.month, current_month: parsed.currentMonth, last_period_complete: parsed.periodClosed },
      reference: { candidates: candidates?.validation ?? null, backtest: backtest?.validation ?? null },
    },
    validation: {
      compatible_scopes: scopeCompatible,
      observed_cutoff_is_target_month: observedContext?.cutoff_month === parsed.month,
      reference_cutoff_precedes_target: referenceContext?.cutoff_month === parsed.referenceCutoffMonth,
      no_target_month_used_for_reference: candidates?.validation?.no_target_month_used ?? null,
      no_future_month_used_for_reference: candidates?.validation?.no_future_month_used ?? null,
    },
    warnings,
  };
}
