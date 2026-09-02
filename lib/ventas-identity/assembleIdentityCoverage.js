const n = (value) => Number(value ?? 0);
const list = (value) => Array.isArray(value) ? value : [];
const pct = (value, total) => total ? Number(((value / total) * 100).toFixed(6)) : null;

export function assembleIdentityCoverage(row = {}) {
  const total = n(row.rows_total);
  const storeResolved = n(row.rows_store_resolved);
  const storeUnresolved = n(row.rows_store_unresolved);
  const storeAmbiguous = n(row.rows_store_ambiguous);
  const sellerResolved = n(row.rows_seller_resolved);
  const sellerUnresolved = n(row.rows_seller_unresolved);
  const sellerAmbiguous = n(row.rows_seller_ambiguous);
  const bothResolved = n(row.rows_both_resolved);
  const sellerUnvalidated = n(row.rows_seller_unvalidated);
  const resolvedPersonIdentity = n(row.resolved_person_identity ?? row.rows_seller_resolved);
  const eligibleVendedorCidef = n(row.eligible_vendedor_cidef);
  const resolvedPersonNotVendedorCidef = n(row.resolved_person_not_vendedor_cidef);

  const validation = {
    store_reconciles: total === storeResolved + storeUnresolved + storeAmbiguous,
    seller_reconciles: total === sellerResolved + sellerUnresolved + sellerAmbiguous,
    joint_not_above_store: bothResolved <= storeResolved,
    joint_not_above_seller: bothResolved <= sellerResolved,
    store_master_key_unique: storeAmbiguous === 0,
    seller_master_key_unique: sellerAmbiguous === 0,
    seller_eligibility_reconciles: resolvedPersonIdentity
      === eligibleVendedorCidef + resolvedPersonNotVendedorCidef,
  };
  validation.ok = Object.values(validation).every(Boolean);

  const warnings = [];
  if (storeUnresolved) warnings.push(`${storeUnresolved} ventas sin sucursal MASTER exacta`);
  if (sellerUnresolved) warnings.push(`${sellerUnresolved} ventas sin persona MASTER exacta`);
  if (storeAmbiguous) warnings.push(`${storeAmbiguous} ventas con sucursal MASTER ambigua`);
  if (sellerAmbiguous) warnings.push(`${sellerAmbiguous} ventas con persona MASTER ambigua`);
  if (sellerUnvalidated) warnings.push(`${sellerUnvalidated} ventas resueltas a personas_master.validated=false`);

  return {
    rows_total: total,
    rows_store_resolved: storeResolved,
    rows_store_unresolved: storeUnresolved,
    rows_store_ambiguous: storeAmbiguous,
    rows_seller_resolved: sellerResolved,
    rows_seller_unresolved: sellerUnresolved,
    rows_seller_ambiguous: sellerAmbiguous,
    resolved_person_identity: resolvedPersonIdentity,
    eligible_vendedor_cidef: eligibleVendedorCidef,
    resolved_person_not_vendedor_cidef: resolvedPersonNotVendedorCidef,
    rows_both_resolved: bothResolved,
    coverage_pct: {
      store: pct(storeResolved, total),
      seller: pct(sellerResolved, total),
      both: pct(bothResolved, total),
    },
    distinct_keys: {
      store: n(row.distinct_store_keys),
      seller: n(row.distinct_seller_keys),
    },
    unresolved: {
      stores: list(row.store_unresolved).sort(),
      sellers: list(row.seller_unresolved).sort(),
    },
    ambiguous: {
      stores: list(row.store_ambiguous).sort(),
      sellers: list(row.seller_ambiguous).sort(),
    },
    resolved_to_unvalidated_person_rows: sellerUnvalidated,
    validation,
    warnings,
  };
}
