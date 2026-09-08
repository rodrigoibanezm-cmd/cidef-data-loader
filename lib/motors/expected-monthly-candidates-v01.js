import { buildExpectationInput } from '../expectation/buildExpectationInput.js';
import { calculateExpectations } from '../expectation/calculateExpectations.js';
import { EXPECTATION_CANDIDATE_METADATA } from '../expectation/expectedCandidates.js';
import { buildVentasMonthlyAnalyticalContext } from '../ventas-universe/buildVentasMonthlyAnalyticalContext.js';

export const ENGINE_NAME = 'expected_monthly_candidates_v01';
export const ENGINE_VERSION = '0.1';

function candidateDetails(calculated, cutoffMonth) {
  return Object.entries(calculated.expectations).map(([method, expectedVin]) => ({
    method,
    ...EXPECTATION_CANDIDATE_METADATA[method],
    expected_vin: Number.isFinite(expectedVin) ? expectedVin : null,
    history_available: Number.isFinite(expectedVin),
    evaluability: Number.isFinite(expectedVin) ? 'EVALUABLE' : 'NOT_EVALUABLE_INSUFFICIENT_HISTORY',
    cutoff_month: cutoffMonth,
  }));
}

function scopedMetadata(sharedContext) {
  if (sharedContext?.commercial_universe !== 'OWN_STORES') return {};
  return {
    scope: {
      commercial_universe: 'OWN_STORES',
      grain: 'STORE_BRAND_MONTH',
      metric: 'VIN_SALES',
      store_id: sharedContext.store_id,
      brand_id: sharedContext.brand_id,
    },
    source: {
      universe: sharedContext.lineage?.universe ?? 'ventas_universe_v01',
      analytical_events: sharedContext.lineage?.source ?? 'ventas_universe_v01.analytical_events',
    },
    scope_coverage: sharedContext.scope_coverage ?? null,
    identity_coverage: sharedContext.identity_coverage ?? null,
  };
}

export function calculateExpectedMonthlyCandidates(sharedContext, input) {
  const { cutoff_month: cutoffMonth, target_month: targetMonth } = input;
  const expectationInput = buildExpectationInput(
    sharedContext?.monthlySales,
    cutoffMonth,
    targetMonth,
  );
  const calculated = calculateExpectations(expectationInput);
  const contextCutoffOk = sharedContext?.cutoff_month === cutoffMonth;

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: contextCutoffOk && calculated.all_candidates_available ? 'ok' : 'warning',
    cutoff_month: cutoffMonth,
    target_month: targetMonth,
    expectations: calculated.expectations,
    candidates: candidateDetails(calculated, cutoffMonth),
    coverage: {
      source_months_used: expectationInput.monthly_sales.length,
      last_source_month: expectationInput.monthly_sales.at(-1)?.month ?? null,
      candidates_total: calculated.candidates_total,
      candidates_available: calculated.candidates_available,
    },
    validation: {
      context_cutoff_ok: contextCutoffOk,
      no_target_month_used: expectationInput.monthly_sales.every((row) => row.month < targetMonth),
      no_future_month_used: expectationInput.monthly_sales.every((row) => row.month <= cutoffMonth),
      all_candidates_available: calculated.all_candidates_available,
    },
    warnings: sharedContext?.warnings ?? [],
    ...scopedMetadata(sharedContext),
  };
}

export async function expectedMonthlyCandidatesV01(input = {}) {
  const cutoffMonth = input.cutoff_month;
  const targetMonth = input.target_month;
  const requestedUniverse = String(input.commercial_universe ?? 'COMPANY').trim().toUpperCase();
  const sharedScopeMatches = input.sharedContext?.cutoff_month === cutoffMonth
    && (requestedUniverse === 'COMPANY'
      ? input.sharedContext?.commercial_universe == null || input.sharedContext?.commercial_universe === 'COMPANY'
      : input.sharedContext?.commercial_universe === 'OWN_STORES'
        && Number(input.sharedContext?.store_id) === Number(input.store_id)
        && Number(input.sharedContext?.brand_id) === Number(input.brand_id));
  const reusable = sharedScopeMatches
    ? input.sharedContext
    : await buildVentasMonthlyAnalyticalContext({
      cutoffMonth,
      commercial_universe: requestedUniverse,
      store_id: input.store_id,
      brand_id: input.brand_id,
    });

  return calculateExpectedMonthlyCandidates(reusable, {
    cutoff_month: cutoffMonth,
    target_month: targetMonth,
  });
}
