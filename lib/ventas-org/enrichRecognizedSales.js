function identityStatus(hit) {
  if (!hit) return 'NO_RESUELTA';
  return hit.match_count === 1 ? 'RESUELTA' : 'AMBIGUA';
}

export function enrichRecognizedSale(sale, identityMaps) {
  const stores = identityMaps?.stores ?? new Map();
  const sellers = identityMaps?.sellers ?? new Map();
  const storeKey = sale.sucursal_source_key ?? sale.sucursal_id ?? null;
  const sellerKey = sale.vendedor_source_key ?? sale.vendedor ?? null;
  const store = storeKey == null ? null : stores.get(String(storeKey));
  const seller = sellerKey == null ? null : sellers.get(String(sellerKey));
  const storeStatus = identityStatus(store);
  const sellerStatus = identityStatus(seller);
  const personaId = sellerStatus === 'RESUELTA' ? seller.canonical_id : null;
  const eligibleVendedorCidef = isVendedorCidef(
    personaId, sale.fecha_venta_iso, identityMaps?.vendedorCidef,
  );

  return {
    source_id: sale.source_id,
    month: sale.mes_venta,
    sucursal_source_key: storeKey,
    vendedor_source_key: sellerKey,
    sucursal_id: storeStatus === 'RESUELTA' ? store.canonical_id : null,
    sucursal_nombre: storeStatus === 'RESUELTA' ? store.nombre_canonico : null,
    tipo_canal: storeStatus === 'RESUELTA' ? store.tipo_canal ?? null : null,
    persona_id: personaId,
    persona_nombre: sellerStatus === 'RESUELTA' ? seller.nombre_canonico : null,
    persona_validated: sellerStatus === 'RESUELTA' ? seller.validated : null,
    store_identity_status: storeStatus,
    seller_identity_status: sellerStatus,
    seller_eligibility_status: sellerStatus !== 'RESUELTA'
      ? sellerStatus
      : eligibleVendedorCidef ? 'ELIGIBLE_VENDEDOR_CIDEF' : 'RESOLVED_NOT_VENDEDOR_CIDEF',
    eligible_vendedor_cidef: eligibleVendedorCidef,
  };
}

export function enrichRecognizedSales(recognizedSales, identityMaps) {
  return recognizedSales.map((sale) => enrichRecognizedSale(sale, identityMaps));
}
import { isVendedorCidef } from './vendedorCidef.js';
