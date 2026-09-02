import { monthRange } from '../deterioration/monthRange.js';
import { observationUnitIndex } from './buildObservationSnapshots.js';
import { classifyObservationState } from './observationState.js';

export function buildActiveZeroDetail(oldSnapshots, nvCounts, parsed) {
  const identities = observationUnitIndex(oldSnapshots);
  const rows = [];

  for (const month of monthRange(parsed.startMonth, parsed.endMonth)) {
    const snapshot = oldSnapshots.snapshots.get(month);
    for (const [unitId, identity] of identities) {
      const recognizedSales = snapshot?.units.get(unitId)?.months.get(month) ?? 0;
      const nvCount = nvCounts.get(String(unitId))?.get(month) ?? 0;
      const observed = classifyObservationState(recognizedSales, nvCount);
      if (observed.state !== 'ACTIVE_ZERO') continue;
      rows.push({
        unit_id: identity.unit_id,
        unit_label: identity.unit_label,
        month,
        recognized_sales: recognizedSales,
        nv_count: nvCount,
        state: observed.state,
        sales: observed.sales,
      });
    }
  }

  return rows.sort((a, b) =>
    `${a.unit_id}|${a.month}`.localeCompare(`${b.unit_id}|${b.month}`));
}
