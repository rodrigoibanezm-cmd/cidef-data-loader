function unitFromStore(row) {
  return {
    unit_key: String(row.sucursal_id),
    sucursal_id: row.sucursal_id,
    persona_id: null,
    month: row.month,
    sales: Number(row.sales),
    parent_sales: Number(row.cidef_sales),
    share: Number(row.share_of_cidef),
  };
}

function unitFromSeller(row) {
  return {
    unit_key: `${row.sucursal_id}|${row.persona_id}`,
    sucursal_id: row.sucursal_id,
    persona_id: row.persona_id,
    month: row.month,
    sales: Number(row.sales),
    parent_sales: Number(row.store_sales),
    share: Number(row.share_of_store),
  };
}

export function buildShareSeries(context, grain) {
  const source = grain === 'tienda' ? context.store_monthly : context.seller_monthly;
  const convert = grain === 'tienda' ? unitFromStore : unitFromSeller;
  const rows = (source || [])
    .map(convert)
    .filter((row) => Number.isFinite(row.share))
    .sort((a, b) => {
      const byUnit = a.unit_key.localeCompare(b.unit_key);
      return byUnit || a.month.localeCompare(b.month);
    });

  const units = new Map();
  for (const row of rows) {
    if (!units.has(row.unit_key)) units.set(row.unit_key, []);
    units.get(row.unit_key).push(row);
  }
  return { rows, units };
}
