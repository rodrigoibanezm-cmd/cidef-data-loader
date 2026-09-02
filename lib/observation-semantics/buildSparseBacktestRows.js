import { expectedLastYear } from '../expectation/expectedCandidates.js';
import { shiftMonth } from '../expectation/monthSeries.js';
import { calculateDeviations } from '../deterioration/orgDeviations.js';
import { monthRange } from '../deterioration/monthRange.js';

function unitUniverse(history, actual) {
  return [...new Set([...history.units.keys(), ...actual.units.keys()])].sort();
}

export function buildSparseBacktestRows(snapshotSet, parsed) {
  const allRows = [];
  const rows = [];
  const priorErrors = new Map();
  let skippedMissingBaseline = 0;
  let skippedUnknownActual = 0;
  const allMonths = monthRange(snapshotSet.first_data_month || parsed.startMonth, parsed.endMonth);
  const months = monthRange(parsed.startMonth, parsed.endMonth);

  for (const month of allMonths) {
    const historyCutoff = shiftMonth(month, -1);
    const history = snapshotSet.snapshots.get(historyCutoff);
    const actual = snapshotSet.snapshots.get(month);
    for (const unitId of unitUniverse(history, actual)) {
      const historyUnit = history.units.get(unitId);
      const actualUnit = actual.units.get(unitId);
      const identity = actualUnit || historyUnit;
      const baselineValue = expectedLastYear(historyUnit?.months ?? new Map(), month);
      if (baselineValue == null) {
        if (month >= parsed.startMonth) skippedMissingBaseline += 1;
        continue;
      }
      if (!actualUnit?.months.has(month)) {
        if (month >= parsed.startMonth) skippedUnknownActual += 1;
        continue;
      }

      const actualSales = actualUnit.months.get(month);
      const errorKey = `${unitId}|last_year`;
      const errors = priorErrors.get(errorKey) || [];
      const deviations = calculateDeviations(actualSales, baselineValue, errors);
      const row = {
        grain: 'tienda', unit_id: identity.unit_id, unit_label: identity.unit_label,
        identity_validated: identity.identity_validated, month, sales: actualSales,
        baseline: 'last_year', baseline_value: baselineValue,
        baseline_history_required: [shiftMonth(month, -12)],
        history_cutoff_month: historyCutoff,
        actual_cutoff_month: month,
        deviations,
      };
      allRows.push(row);
      if (month >= parsed.startMonth) rows.push(row);
      priorErrors.set(errorKey, [...errors, deviations.error]);
    }
  }

  return { allRows, rows, months, skippedMissingBaseline, skippedUnknownActual };
}
