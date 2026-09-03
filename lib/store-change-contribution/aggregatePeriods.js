const empty = () => ({ cidefSales: 0, resolvedStoreSales: 0, storeCounts: new Map() });
const count = (rows, month, predicate) => rows
  .filter((row) => row.month === month && predicate(row))
  .reduce((sum, row) => sum + Number(row.sales || 0), 0);

function change(salesA, salesB) {
  return { sales_period_a: salesA, sales_period_b: salesB, delta_sales: salesB - salesA };
}

function residual(context, parsed) {
  const rows = context.store_identity_monthly || [];
  const status = (value) => change(
    count(rows, parsed.periodA, (row) => row.store_identity_status === value),
    count(rows, parsed.periodB, (row) => row.store_identity_status === value),
  );
  const channels = new Set(rows
    .filter((row) => row.store_identity_status === 'RESUELTA' && row.tipo_canal !== 'CIDEF')
    .map((row) => row.tipo_canal ?? null));
  const resolvedNonCidef = [...channels].map((tipoCanal) => ({
    tipo_canal: tipoCanal,
    ...change(
      count(rows, parsed.periodA, (row) => row.store_identity_status === 'RESUELTA'
        && (row.tipo_canal ?? null) === tipoCanal),
      count(rows, parsed.periodB, (row) => row.store_identity_status === 'RESUELTA'
        && (row.tipo_canal ?? null) === tipoCanal),
    ),
  })).sort((a, b) => String(a.tipo_canal).localeCompare(String(b.tipo_canal)));
  const unresolvedStore = status('NO_RESUELTA');
  const ambiguousStore = status('AMBIGUA');
  const nonCidefA = resolvedNonCidef.reduce((sum, row) => sum + row.sales_period_a, 0);
  const nonCidefB = resolvedNonCidef.reduce((sum, row) => sum + row.sales_period_b, 0);
  return {
    unresolved_store: unresolvedStore,
    ambiguous_store: ambiguousStore,
    resolved_non_cidef: resolvedNonCidef,
    total: change(
      unresolvedStore.sales_period_a + ambiguousStore.sales_period_a + nonCidefA,
      unresolvedStore.sales_period_b + ambiguousStore.sales_period_b + nonCidefB,
    ),
  };
}

const outputId = (value) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value;
};

export function aggregateStoreChange(context, parsed) {
  const periodA = empty();
  const periodB = empty();
  periodA.cidefSales = count(context.cidef_monthly || [], parsed.periodA, () => true);
  periodB.cidefSales = count(context.cidef_monthly || [], parsed.periodB, () => true);

  for (const row of context.store_monthly || []) {
    if (row.tipo_canal !== 'CIDEF') continue;
    const period = row.month === parsed.periodA ? periodA : row.month === parsed.periodB ? periodB : null;
    if (!period) continue;
    const key = String(row.sucursal_id);
    const sales = Number(row.sales || 0);
    period.storeCounts.set(key, (period.storeCounts.get(key) || 0) + sales);
    period.resolvedStoreSales += sales;
  }

  const metadata = new Map((context.identity_metadata?.stores || [])
    .map((row) => [String(row.sucursal_id), row]));
  const ids = new Set([...periodA.storeCounts.keys(), ...periodB.storeCounts.keys()]);
  const stores = [...ids].map((key) => {
    const salesA = periodA.storeCounts.get(key) || 0;
    const salesB = periodB.storeCounts.get(key) || 0;
    return {
      sucursal_id: outputId(key),
      sucursal: metadata.get(key)?.nombre_canonico ?? null,
      tipo_canal: 'CIDEF',
      sales_period_a: salesA,
      sales_period_b: salesB,
      delta_sales: salesB - salesA,
    };
  });
  return { periodA, periodB, stores, organizationalResidual: residual(context, parsed), metadata };
}
