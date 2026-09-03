const ratio = (num, den) => den ? num / den : null;
const add = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

function sortedRows(map, build) {
  return [...map.entries()]
    .map(([key, sales]) => build(key, sales))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function buildOrganizationalSeries(events, { startMonth, endMonth }) {
  const scoped = events.filter((row) => row.month >= startMonth && row.month <= endMonth);
  const cidef = new Map();
  const stores = new Map();
  const sellers = new Map();
  const storeChannels = new Map();
  const storeIdentity = new Map();
  const sellerAttribution = new Map();

  for (const row of scoped) {
    add(cidef, row.month);
    const identityKey = JSON.stringify([row.month, row.store_identity_status, row.tipo_canal]);
    add(storeIdentity, identityKey);
    if (row.store_identity_status === 'RESUELTA') {
      add(stores, `${row.month}|${row.sucursal_id}`);
      storeChannels.set(String(row.sucursal_id), row.tipo_canal ?? null);
    }
    if (row.store_identity_status === 'RESUELTA' && row.tipo_canal === 'CIDEF') {
      add(sellerAttribution, JSON.stringify([
        row.month, row.sucursal_id, row.seller_eligibility_status,
      ]));
    }
    if (row.store_identity_status === 'RESUELTA' && row.eligible_vendedor_cidef === true) {
      add(sellers, `${row.month}|${row.sucursal_id}|${row.persona_id}`);
    }
  }

  const cidefMonthly = sortedRows(cidef, (month, sales) => ({ month, sales }));
  const storeMonthly = sortedRows(stores, (key, sales) => {
    const [month, sucursalId] = key.split('|');
    const cidefSales = cidef.get(month) ?? 0;
    return {
      month,
      sucursal_id: sucursalId,
      tipo_canal: storeChannels.get(String(sucursalId)) ?? null,
      sales,
      cidef_sales: cidefSales,
      share_of_cidef: ratio(sales, cidefSales),
    };
  });
  const storeIndex = new Map(storeMonthly.map((row) => [`${row.month}|${row.sucursal_id}`, row.sales]));
  const sellerMonthly = sortedRows(sellers, (key, sales) => {
    const [month, sucursalId, personaId] = key.split('|');
    const storeSales = storeIndex.get(`${month}|${sucursalId}`) ?? 0;
    return {
      month,
      sucursal_id: sucursalId,
      persona_id: personaId,
      tipo_canal: 'CIDEF',
      sales,
      store_sales: storeSales,
      share_of_store: ratio(sales, storeSales),
      temporal_membership_verified: true,
      observed_store_assignment_match: true,
    };
  });
  const storeIdentityMonthly = sortedRows(storeIdentity, (key, sales) => {
    const [month, storeIdentityStatus, tipoCanal] = JSON.parse(key);
    return { month, store_identity_status: storeIdentityStatus, tipo_canal: tipoCanal, sales };
  });
  const sellerAttributionMonthly = sortedRows(sellerAttribution, (key, sales) => {
    const [month, sucursalId, sellerAttributionStatus] = JSON.parse(key);
    return {
      month,
      sucursal_id: sucursalId,
      seller_attribution_status: sellerAttributionStatus,
      sales,
    };
  });

  return {
    scopedEvents: scoped,
    cidefMonthly,
    storeMonthly,
    sellerMonthly,
    storeIdentityMonthly,
    sellerAttributionMonthly,
  };
}
