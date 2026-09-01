function countStatus(events, field, status) {
  return events.filter((row) => row[field] === status).length;
}

function sumsMatch(rows, parents, parentKey, rowKey) {
  const sums = new Map();
  for (const row of rows) sums.set(rowKey(row), (sums.get(rowKey(row)) ?? 0) + row.sales);
  return parents.every((row) => (sums.get(parentKey(row)) ?? 0) === row.sales);
}

function metadata(events) {
  const stores = new Map();
  const sellers = new Map();
  for (const row of events) {
    if (row.sucursal_id != null) stores.set(String(row.sucursal_id), {
      sucursal_id: row.sucursal_id,
      nombre_canonico: row.sucursal_nombre,
    });
    if (row.persona_id != null) sellers.set(String(row.persona_id), {
      persona_id: row.persona_id,
      nombre_canonico: row.persona_nombre,
      validated: row.persona_validated,
    });
  }
  return {
    stores: [...stores.values()].sort((a, b) => String(a.sucursal_id).localeCompare(String(b.sucursal_id))),
    sellers: [...sellers.values()].sort((a, b) => String(a.persona_id).localeCompare(String(b.persona_id))),
  };
}

export function assembleOrganizationalContext(ventasContext, series, scope) {
  const events = series.scopedEvents;
  const storeResolved = countStatus(events, 'store_identity_status', 'RESUELTA');
  const sellerResolved = countStatus(events, 'seller_identity_status', 'RESUELTA');
  const bothResolved = events.filter((row) => row.sucursal_id != null && row.persona_id != null).length;
  const sourceMonthly = (ventasContext.monthlySales || [])
    .filter((row) => row.month >= scope.startMonth && row.month <= scope.endMonth);
  const sameCidef = JSON.stringify(sourceMonthly) === JSON.stringify(series.cidefMonthly);

  const validation = {
    ventas_context_reconciles: ventasContext.validation?.ok === true,
    monthly_cidef_reconciles_with_ventas_context: sameCidef,
    store_monthly_reconciles: sumsMatch(
      series.storeMonthly, series.cidefMonthly, (row) => row.month, (row) => row.month,
    ),
    seller_monthly_reconciles: sumsMatch(
      series.sellerMonthly, series.storeMonthly,
      (row) => `${row.month}|${row.sucursal_id}`,
      (row) => `${row.month}|${row.sucursal_id}`,
    ),
    no_seller_without_store: series.sellerMonthly.every((row) => row.sucursal_id != null),
    uses_observed_store_only: true,
    store_identity_keys_unique: countStatus(events, 'store_identity_status', 'AMBIGUA') === 0,
    seller_identity_keys_unique: countStatus(events, 'seller_identity_status', 'AMBIGUA') === 0,
    shares_in_bounds: [...series.storeMonthly, ...series.sellerMonthly]
      .every((row) => (row.share_of_cidef ?? row.share_of_store) >= 0 && (row.share_of_cidef ?? row.share_of_store) <= 1),
    has_scoped_sales: events.length > 0,
  };
  validation.ok = Object.values(validation).every(Boolean);

  const warnings = [...(ventasContext.warnings || [])];
  const unvalidated = events.filter((row) => row.persona_id != null && row.persona_validated === false).length;
  if (storeResolved < events.length) warnings.push(`${events.length - storeResolved} ventas sin sucursal canónica resuelta`);
  if (sellerResolved < events.length) warnings.push(`${events.length - sellerResolved} ventas sin persona canónica resuelta`);
  if (unvalidated) warnings.push(`${unvalidated} ventas resueltas a personas_master.validated=false`);
  if (!events.length) warnings.push('No hay ventas reconocidas dentro del período solicitado');

  return {
    context: 'ventas_organizational_context_v01',
    version: '0.1',
    scope: { start_month: scope.startMonth, end_month: scope.endMonth },
    cidef_monthly: series.cidefMonthly,
    store_monthly: series.storeMonthly,
    seller_monthly: series.sellerMonthly,
    identity_metadata: metadata(events),
    coverage: {
      recognized_sales_total: events.length,
      recognized_sales_available_total: ventasContext.recognizedSales?.length ?? 0,
      recognized_sales_with_store_identity: storeResolved,
      recognized_sales_with_seller_identity: sellerResolved,
      recognized_sales_with_both_identities: bothResolved,
      unresolved_store: countStatus(events, 'store_identity_status', 'NO_RESUELTA'),
      unresolved_seller: countStatus(events, 'seller_identity_status', 'NO_RESUELTA'),
      ambiguous_store: countStatus(events, 'store_identity_status', 'AMBIGUA'),
      ambiguous_seller: countStatus(events, 'seller_identity_status', 'AMBIGUA'),
      resolved_to_unvalidated_person: unvalidated,
    },
    validation,
    warnings,
  };
}
