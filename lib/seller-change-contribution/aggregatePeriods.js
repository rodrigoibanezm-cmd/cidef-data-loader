import { buildSellerResidual } from './sellerResidual.js';

const outputId = (value) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value;
};

function periodCounts(context, parsed, storeIds) {
  const counts = new Map();
  for (const row of context.seller_monthly || []) {
    if (![parsed.periodA, parsed.periodB].includes(row.month)) continue;
    if (!storeIds.has(String(row.sucursal_id))) continue;
    const key = `${row.sucursal_id}|${row.persona_id}`;
    if (!counts.has(key)) counts.set(key, { periodA: 0, periodB: 0 });
    const period = row.month === parsed.periodA ? 'periodA' : 'periodB';
    counts.get(key)[period] += Number(row.sales || 0);
  }
  return counts;
}

function sellerRows(context, parsed, stores) {
  const storeIds = new Set(stores.map((row) => String(row.sucursal_id)));
  const counts = periodCounts(context, parsed, storeIds);
  const metadata = new Map((context.identity_metadata?.sellers || [])
    .map((row) => [String(row.persona_id), row]));
  const byStore = new Map();
  for (const [key, sales] of counts.entries()) {
    const [storeId, personaId] = key.split('|');
    if (!byStore.has(storeId)) byStore.set(storeId, []);
    byStore.get(storeId).push({
      persona_id: outputId(personaId),
      vendedor: metadata.get(personaId)?.nombre_canonico ?? null,
      sales_period_a: sales.periodA,
      sales_period_b: sales.periodB,
      delta_sales: sales.periodB - sales.periodA,
    });
  }
  return byStore;
}

export function aggregateSellerChange(context, parsed, storeResult) {
  const sellersByStore = sellerRows(context, parsed, storeResult.stores);
  const attribution = context.seller_attribution_monthly || [];
  return storeResult.stores.map((store) => ({
    sucursal_id: store.sucursal_id,
    sucursal: store.sucursal,
    tipo_canal: 'CIDEF',
    sales_period_a: store.sales_period_a,
    sales_period_b: store.sales_period_b,
    delta_sales: store.delta_sales,
    sellers: sellersByStore.get(String(store.sucursal_id)) || [],
    seller_residual: buildSellerResidual(attribution, parsed, store.sucursal_id),
  }));
}
