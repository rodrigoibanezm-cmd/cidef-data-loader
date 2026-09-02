import { normalizeProductKey } from './normalize.js';

export function resolveSaleModel(sale, resolutionMap) {
  const keys = [...new Set([
    normalizeProductKey(sale.producto_sku),
    normalizeProductKey(sale.producto),
  ].filter(Boolean))];

  const matches = keys.map((key) => resolutionMap.get(key)).filter(Boolean);
  const resolvedIds = [...new Set(matches
    .filter((row) => row.status === 'RESOLVED' && Number.isFinite(Number(row.modelo_id)))
    .map((row) => Number(row.modelo_id)))];
  const hasAmbiguous = matches.some((row) => row.status === 'AMBIGUOUS');

  if (resolvedIds.length > 1 || (hasAmbiguous && !resolvedIds.length)) {
    return { ...sale, product_identity_status: 'AMBIGUOUS', modelo_id: null, version_id: null, product_resolution_method: null };
  }
  if (resolvedIds.length === 1) {
    const winner = matches.find((row) => row.status === 'RESOLVED' && Number(row.modelo_id) === resolvedIds[0]);
    return {
      ...sale,
      product_identity_status: 'RESOLVED',
      modelo_id: resolvedIds[0],
      version_id: null,
      product_resolution_method: winner?.resolution_method || null,
    };
  }
  return { ...sale, product_identity_status: 'UNRESOLVED', modelo_id: null, version_id: null, product_resolution_method: null };
}

export function resolveSalesModels(sales = [], resolutionMap = new Map()) {
  return sales.map((sale) => resolveSaleModel(sale, resolutionMap));
}
