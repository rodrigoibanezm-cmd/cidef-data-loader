function compareId(a, b, idField) {
  const left = Number(a[idField]);
  const right = Number(b[idField]);
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  return String(a[idField]).localeCompare(String(b[idField]));
}

function rank(rows, predicate, compare, idField) {
  return new Map(rows.filter(predicate).sort(compare)
    .map((row, index) => [String(row[idField]), index + 1]));
}

export function rankContributions(rows, deltaCidef, idField = 'modelo_id') {
  const supportRanks = rank(
    rows,
    (row) => row.delta_sales > 0,
    (a, b) => b.delta_sales - a.delta_sales || compareId(a, b, idField),
    idField,
  );
  const dragRanks = rank(
    rows,
    (row) => row.delta_sales < 0,
    (a, b) => a.delta_sales - b.delta_sales || compareId(a, b, idField),
    idField,
  );

  return rows.map((row) => ({
    ...row,
    contribution_pct_of_cidef_delta: deltaCidef === 0
      ? null
      : Number((100 * row.delta_sales / deltaCidef).toFixed(2)),
    support_rank: supportRanks.get(String(row[idField])) ?? null,
    drag_rank: dragRanks.get(String(row[idField])) ?? null,
  })).sort((a, b) => Math.abs(b.delta_sales) - Math.abs(a.delta_sales)
    || compareId(a, b, idField));
}
