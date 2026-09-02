const num = (value) => Number(value ?? 0);
const pp = (value) => (value == null ? null : Number((100 * value).toFixed(6)));

function key(row) {
  return `${row.universeKey}|${row.entityKey}`;
}

export function summarizeTrajectory(monthlyRows = []) {
  const groups = new Map();
  for (const row of monthlyRows) {
    if (!groups.has(key(row))) groups.set(key(row), []);
    groups.get(key(row)).push(row);
  }

  return [...groups.values()].map((rows) => {
    const ordered = [...rows].sort((a, b) => a.month.localeCompare(b.month));
    const first = ordered[0];
    const last = ordered.at(-1);
    const firstShare = first?.share ?? null;
    const lastShare = last?.share ?? null;
    return {
      universe: first.universe,
      entityKey: first.entityKey,
      modelId: first.modelId,
      identityStatus: first.identityStatus,
      brand: first.brand,
      model: first.model,
      marketOrigin: first.marketOrigin,
      isTarget: first.targetModelIds.includes(first.modelId),
      firstMonth: first.month,
      lastMonth: last.month,
      firstUnits: num(first.units),
      lastUnits: num(last.units),
      firstShare,
      lastShare,
      shareChangePp: firstShare == null || lastShare == null ? null : pp(lastShare - firstShare),
      firstRank: first.rank,
      lastRank: last.rank,
      rankChange: first.rank == null || last.rank == null ? null : last.rank - first.rank,
      monthsWithUnits: ordered.filter((row) => num(row.units) !== 0).length,
      totalUnits: ordered.reduce((sum, row) => sum + num(row.units), 0),
    };
  }).sort((a, b) => (b.totalUnits - a.totalUnits)
    || String(a.brand || '').localeCompare(String(b.brand || ''))
    || String(a.model || '').localeCompare(String(b.model || '')));
}
