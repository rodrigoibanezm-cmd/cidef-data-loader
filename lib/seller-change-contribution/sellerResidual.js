const CATEGORIES = [
  ['persona_unresolved', 'NO_RESUELTA'],
  ['persona_ambiguous', 'AMBIGUA'],
  ['resolved_not_vendedor_cidef', 'RESOLVED_NOT_VENDEDOR_CIDEF'],
  ['store_assignment_mismatch', 'VENDEDOR_CIDEF_STORE_MISMATCH'],
];

const change = (salesA, salesB) => ({
  sales_period_a: salesA,
  sales_period_b: salesB,
  delta_sales: salesB - salesA,
});

function count(rows, month, storeId, status) {
  return rows
    .filter((row) => row.month === month
      && String(row.sucursal_id) === String(storeId)
      && row.seller_attribution_status === status)
    .reduce((sum, row) => sum + Number(row.sales || 0), 0);
}

export function buildSellerResidual(rows, parsed, storeId) {
  const breakdown = Object.fromEntries(CATEGORIES.map(([name, status]) => [
    name,
    change(
      count(rows, parsed.periodA, storeId, status),
      count(rows, parsed.periodB, storeId, status),
    ),
  ]));
  const salesA = Object.values(breakdown)
    .reduce((sum, row) => sum + row.sales_period_a, 0);
  const salesB = Object.values(breakdown)
    .reduce((sum, row) => sum + row.sales_period_b, 0);
  return { ...change(salesA, salesB), breakdown };
}
