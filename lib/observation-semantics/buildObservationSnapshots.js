import { classifyObservationState } from './observationState.js';

function cloneUnit(unit) {
  return {
    unit_id: unit.unit_id,
    unit_label: unit.unit_label,
    identity_validated: unit.identity_validated,
    months: new Map(unit.months),
  };
}

export function observationUnitIndex(snapshotSet) {
  const units = new Map();
  for (const snapshot of snapshotSet.snapshots.values()) {
    for (const [unitId, unit] of snapshot.units) if (!units.has(unitId)) units.set(unitId, unit);
  }
  return units;
}

export function buildObservationSnapshots(snapshotSet, nvCounts) {
  const allowed = observationUnitIndex(snapshotSet);
  const snapshots = new Map();

  for (const cutoff of snapshotSet.cutoffs) {
    const source = snapshotSet.snapshots.get(cutoff);
    const units = new Map();
    for (const [unitId, unit] of source.units) units.set(unitId, cloneUnit(unit));

    for (const [unitId, monthCounts] of nvCounts) {
      if (!allowed.has(unitId)) continue;
      if (!units.has(unitId)) {
        const identity = allowed.get(unitId);
        units.set(unitId, { ...cloneUnit(identity), months: new Map() });
      }
      const unit = units.get(unitId);
      for (const [month, count] of monthCounts) {
        if (month > cutoff) continue;
        const recognized = unit.months.get(month) ?? 0;
        const observed = classifyObservationState(recognized, count);
        if (observed.state === 'ACTIVE_ZERO') unit.months.set(month, 0);
      }
    }
    snapshots.set(cutoff, { ...source, units });
  }

  return { ...snapshotSet, snapshots };
}
