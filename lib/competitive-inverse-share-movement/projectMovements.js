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

export function projectInverseShareMovements(
  rows,
  { pairOffset, pairLimit, minEvaluableTransitions = null },
) {
  const eligible = minEvaluableTransitions == null
    ? rows
    : rows.filter((row) => row.jointEvaluableTransitions >= minEvaluableTransitions);
  const ordered = orderInverseShareMovements(eligible);
  const pageRows = ordered.slice(pairOffset, pairOffset + pairLimit);
  const nextOffset = pairOffset + pageRows.length;
  return {
    movements: pageRows,
    page: {
      pairOffset,
      pairLimit,
      minEvaluableTransitions,
      totalRelations: rows.length,
      eligibleRelations: eligible.length,
      excludedByMinEvidence: rows.length - eligible.length,
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
