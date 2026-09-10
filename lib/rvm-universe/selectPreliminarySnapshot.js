export function selectPreliminarySnapshot(inventory = [], { dateFrom, cutoffDate } = {}) {
  if (inventory.length > 1) {
    return { selected: null, warning: 'MULTIPLE_PRELIMINARY_SNAPSHOTS' };
  }
  const selected = inventory[0] ?? null;
  if (!selected || selected.snapshot_date !== cutoffDate
    || selected.max_date !== cutoffDate || selected.min_date < dateFrom) {
    return { selected: null, warning: 'NO_VALID_PRELIMINARY_SNAPSHOT' };
  }
  return { selected, warning: null };
}
