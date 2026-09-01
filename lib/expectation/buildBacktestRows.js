import { EXPECTATION_CANDIDATES } from './expectedCandidates.js';
import { buildSalesIndex } from './monthSeries.js';

export function buildBacktestRows(monthlySales) {
  const index = buildSalesIndex(monthlySales);
  const months = [...index.keys()].sort();
  const rows = [];
  const skipped = [];

  for (const month of months) {
    const expected = {};
    let complete = true;

    for (const [name, candidate] of Object.entries(EXPECTATION_CANDIDATES)) {
      const value = candidate(index, month);
      expected[name] = value;
      if (value == null || !Number.isFinite(value)) complete = false;
    }

    if (!complete) {
      skipped.push(month);
      continue;
    }

    rows.push({
      month,
      actual: index.get(month),
      expected,
    });
  }

  return {
    rows,
    skipped_months: skipped,
    first_evaluable_month: rows[0]?.month ?? null,
    last_evaluable_month: rows[rows.length - 1]?.month ?? null,
  };
}
