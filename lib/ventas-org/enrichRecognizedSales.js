function identityStatus(hit) {
  if (!hit) return 'NO_RESUELTA';
  return hit.match_count === 1 ? 'RESUELTA' : 'AMBIGUA';
}

export function enrichRecognizedSales(recognizedSales, identityMaps) {
  const stores = identityMaps?.stores ?? new Map();
  const sellers = identityMaps?.sellers ?? new Map();

  return recognizedSales.map((sale) => {
    const storeKey = sale.sucursal_source_key ?? sale.sucursal_id ?? null;
    const sellerKey = sale.vendedor_source_key ?? sale.vendedor ?? null;
    const store = storeKey == null ? null : stores.get(String(storeKey));
    const seller = sellerKey == null ? null : sellers.get(String(sellerKey));
    const storeStatus = identityStatus(store);
    const sellerStatus = identityStatus(seller);

    return {
      source_id: sale.source_id,
      month: sale.mes_venta,
      sucursal_source_key: storeKey,
      vendedor_source_key: sellerKey,
      sucursal_id: storeStatus === 'RESUELTA' ? store.canonical_id : null,
      sucursal_nombre: storeStatus === 'RESUELTA' ? store.nombre_canonico : null,
      persona_id: sellerStatus === 'RESUELTA' ? seller.canonical_id : null,
      persona_nombre: sellerStatus === 'RESUELTA' ? seller.nombre_canonico : null,
      persona_validated: sellerStatus === 'RESUELTA' ? seller.validated : null,
      store_identity_status: storeStatus,
      seller_identity_status: sellerStatus,
    };
  });
}
