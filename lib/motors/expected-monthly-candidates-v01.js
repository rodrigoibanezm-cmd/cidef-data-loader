import { buildExpectationInput } from '../expectation/buildExpectationInput.js';
import { calculateExpectations } from '../expectation/calculateExpectations.js';
import { buildVentasContext } from '../ventas/buildVentasContext.js';

export const ENGINE_NAME = 'expected_monthly_candidates_v01';
export const ENGINE_VERSION = '0.1';

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
  };
}

export async function expectedMonthlyCandidatesV01(input = {}) {
  const cutoffMonth = input.cutoff_month;
  const targetMonth = input.target_month;
  const reusable = input.sharedContext?.cutoff_month === cutoffMonth
    ? input.sharedContext
    : await buildVentasContext({ cutoffMonth });

  return calculateExpectedMonthlyCandidates(reusable, {
    cutoff_month: cutoffMonth,
    target_month: targetMonth,
  });
}
