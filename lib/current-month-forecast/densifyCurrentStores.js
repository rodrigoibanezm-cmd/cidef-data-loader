export function densifyCurrentStores(currentStores, storeSalesToDate) {
  const observed = new Map(
    (storeSalesToDate || [])
      .filter((row) => row.tipo_canal === 'CIDEF')
      .map((row) => [String(row.sucursal_id), row]),
  );

  return (currentStores || []).map((store) => {
    const row = observed.get(String(store.sucursal_id));
    return {
      sucursal_id: store.sucursal_id,
      sucursal: store.sucursal,
      tipo_canal: 'CIDEF',
      observed_to_date: Number(row?.month_sales_to_date || 0),
      observation_semantics: row ? 'POSITIVE_OBSERVED' : 'LIVE_ZERO',
    };
  });
}
