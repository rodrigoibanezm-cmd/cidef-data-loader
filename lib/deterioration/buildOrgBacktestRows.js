import { shiftMonth } from '../expectation/monthSeries.js';
import { monthRange } from './monthRange.js';
import { calculateBaseline } from './orgBaselines.js';
import { calculateDeviations } from './orgDeviations.js';
import { firstObservedMonth, observedValue } from './orgSalesSeries.js';

function monthDistance(fromMonth, toMonth) {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  return (ty - fy) * 12 + tm - fm;
}

function unitUniverse(history, actual) {
  return [...new Set([...history.units.keys(), ...actual.units.keys()])].sort();
}

export function buildOrgBacktestRows(snapshotSet, parsed) {
  const rows = [];
  const priorErrors = new Map();
  const skipped = Object.fromEntries(parsed.baselines.map((name) => [name, 0]));
  const months = monthRange(parsed.startMonth, parsed.endMonth);

  for (const month of months) {
    const history = snapshotSet.snapshots.get(shiftMonth(month, -1));
    const actual = snapshotSet.snapshots.get(month);
    for (const unitKey of unitUniverse(history, actual)) {
      const historyUnit = history.units.get(unitKey);
      const actualUnit = actual.units.get(unitKey);
      const identity = actualUnit || historyUnit;
      for (const baselineName of parsed.baselines) {
        const baseline = calculateBaseline(baselineName, historyUnit, month);
        if (!baseline) {
          skipped[baselineName] += 1;
          continue;
        }
        const errorKey = `${unitKey}|${baselineName}`;
        const errors = priorErrors.get(errorKey) || [];
        const actualSales = observedValue(actualUnit, month);
        const deviations = calculateDeviations(actualSales, baseline.value, errors);
        const firstMonth = firstObservedMonth(historyUnit);
        rows.push({
          grain: parsed.grain,
          unit_id: identity.unit_id,
          unit_label: identity.unit_label,
          identity_validated: identity.identity_validated,
          month,
          sales: actualSales,
          baseline: baselineName,
          baseline_value: baseline.value,
          baseline_history_required: baseline.history_required,
          history_periods_available: firstMonth ? monthDistance(firstMonth, month) : 0,
          deviations,
        });
        priorErrors.set(errorKey, [...errors, deviations.error]);
      }
    }
  }
  return { rows, skipped, months };
}
