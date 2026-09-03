function compareId(a, b) {
  const left = Number(a.persona_id);
  const right = Number(b.persona_id);
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  return String(a.persona_id).localeCompare(String(b.persona_id));
}

const pct = (delta, total) => total === 0
  ? null
  : Number((100 * delta / total).toFixed(2));

function ranks(rows, predicate, compare) {
  return new Map(rows.filter(predicate).sort(compare)
    .map((row, index) => [String(row.persona_id), index + 1]));
}

function rankStoreSellers(rows, storeDelta, cidefDelta) {
  const support = ranks(rows, (row) => row.delta_sales > 0,
    (a, b) => b.delta_sales - a.delta_sales || compareId(a, b));
  const drag = ranks(rows, (row) => row.delta_sales < 0,
    (a, b) => a.delta_sales - b.delta_sales || compareId(a, b));
  return rows.map((row) => ({
    ...row,
    contribution_pct_of_store_delta: pct(row.delta_sales, storeDelta),
    contribution_pct_of_cidef_delta: pct(row.delta_sales, cidefDelta),
    store_support_rank: support.get(String(row.persona_id)) ?? null,
    store_drag_rank: drag.get(String(row.persona_id)) ?? null,
  })).sort((a, b) => Math.abs(b.delta_sales) - Math.abs(a.delta_sales) || compareId(a, b));
}

export function rankSellerContributions(stores, cidefDelta) {
  return stores.map((store) => ({
    ...store,
    sellers: rankStoreSellers(store.sellers, store.delta_sales, cidefDelta),
  }));
}
