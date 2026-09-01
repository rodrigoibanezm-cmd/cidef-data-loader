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

  for (const row of scoped) {
    add(cidef, row.month);
    if (row.store_identity_status === 'RESUELTA') {
      add(stores, `${row.month}|${row.sucursal_id}`);
    }
    if (row.store_identity_status === 'RESUELTA' && row.seller_identity_status === 'RESUELTA') {
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
      sales,
      store_sales: storeSales,
      share_of_store: ratio(sales, storeSales),
    };
  });

  return { scopedEvents: scoped, cidefMonthly, storeMonthly, sellerMonthly };
}
