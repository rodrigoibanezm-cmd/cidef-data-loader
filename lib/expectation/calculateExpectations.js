import { EXPECTATION_CANDIDATES } from './expectedCandidates.js';

export function calculateExpectations(expectationInput) {
  const { sales_index: index, target_month: targetMonth } = expectationInput;
  const expectations = Object.fromEntries(
    Object.entries(EXPECTATION_CANDIDATES).map(([name, calculate]) => [
      name,
      calculate(index, targetMonth),
    ]),
  );

  const available = Object.values(expectations).filter(Number.isFinite).length;

  return {
    expectations,
    candidates_total: Object.keys(EXPECTATION_CANDIDATES).length,
    candidates_available: available,
    all_candidates_available: available === Object.keys(EXPECTATION_CANDIDATES).length,
  };
}
