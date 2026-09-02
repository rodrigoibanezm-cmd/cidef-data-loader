import { monthRange } from '../deterioration/monthRange.js';
import { observationUnitIndex } from './buildObservationSnapshots.js';

export function summarizeObservationStates(oldSnapshots, newSnapshots, parsed) {
  const identities = observationUnitIndex(oldSnapshots);
  const months = monthRange(parsed.startMonth, parsed.endMonth);
  const units = [];
  let observedPositive = 0;
  let activeZero = 0;
  let unknown = 0;

  for (const [unitId, identity] of identities) {
    const evaluable = [];
    const counts = { observed_positive_months: 0, active_zero_months: 0, unknown_months: 0 };
    for (const month of months) {
      const oldUnit = oldSnapshots.snapshots.get(month)?.units.get(unitId);
      const newUnit = newSnapshots.snapshots.get(month)?.units.get(unitId);
      if (oldUnit?.months.has(month)) {
        counts.observed_positive_months += 1; observedPositive += 1; evaluable.push(month);
      } else if (newUnit?.months.has(month) && newUnit.months.get(month) === 0) {
        counts.active_zero_months += 1; activeZero += 1; evaluable.push(month);
      } else {
        counts.unknown_months += 1; unknown += 1;
      }
    }
    units.push({
      unit_id: identity.unit_id, unit_label: identity.unit_label, ...counts,
      first_evaluable_month: evaluable[0] ?? null,
      last_evaluable_month: evaluable.at(-1) ?? null,
    });
  }

  units.sort((a, b) => Number(a.unit_id) - Number(b.unit_id));
  return {
    units,
    coverage: {
      units_total: units.length,
      unit_months_total: units.length * months.length,
      observed_positive_unit_months: observedPositive,
      active_zero_unit_months: activeZero,
      unknown_unit_months: unknown,
    },
  };
}
