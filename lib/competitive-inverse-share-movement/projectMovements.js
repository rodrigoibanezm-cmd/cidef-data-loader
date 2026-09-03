function compareRate(a, b) {
  if (a.inverseDirectionRate == null && b.inverseDirectionRate == null) return 0;
  if (a.inverseDirectionRate == null) return 1;
  if (b.inverseDirectionRate == null) return -1;
  return b.inverseDirectionRate - a.inverseDirectionRate;
}

export function orderInverseShareMovements(rows = []) {
  return [...rows].sort((a, b) => compareRate(a, b)
    || b.inverseDirectionOccurrences - a.inverseDirectionOccurrences
    || b.jointEvaluableTransitions - a.jointEvaluableTransitions
    || a.pairKey.localeCompare(b.pairKey));
}

export function projectInverseShareMovements(rows, { pairOffset, pairLimit }) {
  const ordered = orderInverseShareMovements(rows);
  const pageRows = ordered.slice(pairOffset, pairOffset + pairLimit);
  const nextOffset = pairOffset + pageRows.length;
  return {
    movements: pageRows,
    page: {
      pairOffset,
      pairLimit,
      totalRelations: ordered.length,
      returnedRelations: pageRows.length,
      hasMore: nextOffset < ordered.length,
      nextOffset: nextOffset < ordered.length ? nextOffset : null,
      order: [
        'inverseDirectionRate DESC NULLS LAST',
        'inverseDirectionOccurrences DESC',
        'jointEvaluableTransitions DESC',
        'pairKey ASC',
      ],
    },
  };
}
