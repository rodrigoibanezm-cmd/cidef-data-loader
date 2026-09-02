const CHANNELS = ['CIDEF', 'DEALER', 'DEALER_AGREGADO', 'NO_COMERCIAL'];

function channelCounts() {
  return Object.fromEntries([...CHANNELS, 'UNKNOWN'].map((channel) => [channel, 0]));
}

export function aggregateDailyStoreSales(events, targetMonth) {
  const target = events.filter((event) => event.month === targetMonth);
  const stores = new Map();
  const byChannel = channelCounts();
  let unresolvedStore = 0;
  let ambiguousStore = 0;

  for (const event of target) {
    if (event.store_identity_status === 'NO_RESUELTA') {
      unresolvedStore += 1;
      continue;
    }
    if (event.store_identity_status === 'AMBIGUA') {
      ambiguousStore += 1;
      continue;
    }

    const channel = event.tipo_canal || 'UNKNOWN';
    byChannel[channel] = (byChannel[channel] || 0) + 1;
    const key = String(event.sucursal_id);
    const current = stores.get(key) || {
      sucursal_id: event.sucursal_id,
      sucursal: event.sucursal_nombre,
      tipo_canal: event.tipo_canal ?? null,
      month_sales_to_date: 0,
    };
    current.month_sales_to_date += 1;
    stores.set(key, current);
  }

  const storeSales = [...stores.values()].sort(
    (a, b) => Number(a.sucursal_id) - Number(b.sucursal_id),
  );
  const resolvedStore = storeSales.reduce((sum, row) => sum + row.month_sales_to_date, 0);
  const cidefOwned = storeSales
    .filter((row) => row.tipo_canal === 'CIDEF')
    .reduce((sum, row) => sum + row.month_sales_to_date, 0);

  return {
    storeSales,
    cidefOwned,
    coverage: {
      recognized_sales_in_target_month_to_date: target.length,
      resolved_store: resolvedStore,
      unresolved_store: unresolvedStore,
      ambiguous_store: ambiguousStore,
      resolved_sales_by_channel: byChannel,
    },
  };
}
