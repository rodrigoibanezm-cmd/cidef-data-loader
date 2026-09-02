function storeSourceKey(sale) {
  return sale?.sucursal_source_key ?? sale?.sucursal_id ?? null;
}

export function observedStoreKeysUnique(recognizedSales, stores, targetMonth) {
  const usedKeys = new Set(
    (recognizedSales || [])
      .filter((sale) => sale?.mes_venta === targetMonth)
      .map(storeSourceKey)
      .filter((key) => key != null)
      .map(String),
  );

  for (const key of usedKeys) {
    const hit = stores?.get?.(key);
    if (!hit || hit.match_count !== 1) return false;
  }

  return true;
}
