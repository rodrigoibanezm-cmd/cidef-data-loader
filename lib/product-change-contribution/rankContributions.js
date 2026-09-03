function rank(rows, predicate, compare) {
  return new Map(rows.filter(predicate).sort(compare).map((row, index) => [row.modelo_id, index + 1]));
}

export function rankContributions(models, deltaCidef) {
  const supportRanks = rank(
    models,
    (row) => row.delta_sales > 0,
    (a, b) => b.delta_sales - a.delta_sales || a.modelo_id - b.modelo_id,
  );
  const dragRanks = rank(
    models,
    (row) => row.delta_sales < 0,
    (a, b) => a.delta_sales - b.delta_sales || a.modelo_id - b.modelo_id,
  );

  return models.map((row) => ({
    ...row,
    contribution_pct_of_cidef_delta: deltaCidef === 0
      ? null
      : Number((100 * row.delta_sales / deltaCidef).toFixed(2)),
    support_rank: supportRanks.get(row.modelo_id) ?? null,
    drag_rank: dragRanks.get(row.modelo_id) ?? null,
  })).sort((a, b) => Math.abs(b.delta_sales) - Math.abs(a.delta_sales)
    || a.modelo_id - b.modelo_id);
}
