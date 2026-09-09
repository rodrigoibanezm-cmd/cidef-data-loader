function numberDesc(left, right, field, nullsLast = false) {
  const a = left[field];
  const b = right[field];
  if (a == null || b == null) {
    if (a == null && b == null) return 0;
    return nullsLast ? (a == null ? 1 : -1) : (a == null ? -1 : 1);
  }
  return b - a;
}

export function compareTransfers(a, b, ranking) {
  if (ranking === 'CONSISTENCY') return numberDesc(a, b, 'inverse_consistency_ratio', true)
    || numberDesc(a, b, 'inverse_periods')
    || numberDesc(a, b, 'periods_observed')
    || a.competitor_entity.key.localeCompare(b.competitor_entity.key);
  if (ranking === 'SHARE_MAGNITUDE') return numberDesc(a, b, 'inverse_share_change_magnitude')
    || numberDesc(a, b, 'inverse_periods')
    || numberDesc(a, b, 'inverse_consistency_ratio', true)
    || a.competitor_entity.key.localeCompare(b.competitor_entity.key);
  if (ranking === 'VIN_MAGNITUDE') return numberDesc(a, b, 'inverse_vin_change_magnitude', true)
    || numberDesc(a, b, 'inverse_vin_occurrences')
    || numberDesc(a, b, 'inverse_share_change_magnitude')
    || a.competitor_entity.key.localeCompare(b.competitor_entity.key);
  return Number(b.inverse_direction_flag) - Number(a.inverse_direction_flag)
    || numberDesc(a, b, 'inverse_share_change_magnitude')
    || numberDesc(a, b, 'inverse_vin_change_magnitude', true)
    || a.competitor_entity.key.localeCompare(b.competitor_entity.key);
}

export function rankTransfers(rows, ranking, offset, limit) {
  const ordered = [...rows].sort((a, b) => compareTransfers(a, b, ranking));
  return ordered.slice(offset, offset + limit).map((row, index) => ({ ...row, rank: offset + index + 1 }));
}
