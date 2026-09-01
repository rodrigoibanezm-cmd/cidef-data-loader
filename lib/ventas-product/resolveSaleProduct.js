function norm(value) {
  if (value == null) return null;
  const text = String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return text || null;
}

export function buildProductAliasIndex(aliasRows = []) {
  const index = new Map();
  for (const row of aliasRows) {
    const key = norm(row.valor_normalizado ?? row.valor_raw);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

export function resolveSaleProduct(sale, aliasIndex) {
  const keys = [norm(sale.producto_sku), norm(sale.producto)].filter(Boolean);
  const matches = keys.flatMap((key) => aliasIndex.get(key) || []);
  const modelIds = [...new Set(matches.map((row) => Number(row.modelo_id)).filter(Number.isFinite))];
  const versionIds = [...new Set(matches.map((row) => Number(row.version_id)).filter(Number.isFinite))];

  if (!modelIds.length) return { ...sale, product_identity_status: 'UNRESOLVED', modelo_id: null, version_id: null };
  if (modelIds.length > 1) return { ...sale, product_identity_status: 'AMBIGUOUS', modelo_id: null, version_id: null };

  return {
    ...sale,
    product_identity_status: 'RESOLVED',
    modelo_id: modelIds[0],
    version_id: versionIds.length === 1 ? versionIds[0] : null,
  };
}

export function resolveSalesProducts(sales = [], aliasRows = []) {
  const index = buildProductAliasIndex(aliasRows);
  return sales.map((sale) => resolveSaleProduct(sale, index));
}
