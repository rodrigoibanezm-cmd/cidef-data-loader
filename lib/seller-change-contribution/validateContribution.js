const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);

function reconcileStore(store) {
  const sellersA = sum(store.sellers, 'sales_period_a');
  const sellersB = sum(store.sellers, 'sales_period_b');
  const sellerDelta = sum(store.sellers, 'delta_sales');
  return {
    sucursal_id: store.sucursal_id,
    period_a_reconciles: store.sales_period_a
      === sellersA + store.seller_residual.sales_period_a,
    period_b_reconciles: store.sales_period_b
      === sellersB + store.seller_residual.sales_period_b,
    delta_reconciles: store.delta_sales
      === sellerDelta + store.seller_residual.delta_sales,
  };
}

export function validateSellerContribution({ context, parsed, storeResult, stores }) {
  const reconciliations = stores.map(reconcileStore);
  const sellers = stores.flatMap((store) => store.sellers.map((seller) => ({
    ...seller, sucursal_id: store.sucursal_id,
  })));
  const keys = sellers.map((row) => `${row.sucursal_id}|${row.persona_id}`);
  const source = (context.seller_monthly || []).filter((row) =>
    [parsed.periodA, parsed.periodB].includes(row.month));
  const sourceA = source.filter((row) => row.month === parsed.periodA);
  const sourceB = source.filter((row) => row.month === parsed.periodB);
  const checks = {
    period_order_valid: parsed.periodA < parsed.periodB,
    cutoff_equals_period_b: context.cutoff_month === parsed.periodB
      && context.temporal_evidence?.cutoff_month === parsed.periodB,
    no_post_cutoff_evidence_used:
      context.temporal_evidence?.recognized_sales_after_cutoff === 0,
    ventas_context_ok: context.validation?.ventas_context_reconciles === true,
    seller_surface_only_vendedor_cidef:
      context.validation?.no_out_of_universe_seller === true,
    non_vendedor_roles_excluded: context.validation?.no_out_of_universe_seller === true,
    seller_categories_reconcile: context.validation?.seller_categories_reconcile === true,
    temporal_membership_verified: source.every((row) =>
      row.temporal_membership_verified === true),
    observed_store_assignment_matches: source.every((row) =>
      row.observed_store_assignment_match === true && row.tipo_canal === 'CIDEF'),
    seller_store_key_unique: new Set(keys).size === keys.length,
    seller_period_a_source_reconciles: sum(sellers, 'sales_period_a') === sum(sourceA, 'sales'),
    seller_period_b_source_reconciles: sum(sellers, 'sales_period_b') === sum(sourceB, 'sales'),
    every_store_period_a_reconciles: reconciliations.every((row) => row.period_a_reconciles),
    every_store_period_b_reconciles: reconciliations.every((row) => row.period_b_reconciles),
    every_store_delta_reconciles: reconciliations.every((row) => row.delta_reconciles),
    seller_residual_delta_reconciles: stores.every((row) => row.seller_residual.delta_sales
      === row.seller_residual.sales_period_b - row.seller_residual.sales_period_a),
    stores_only_cidef: stores.every((row) => row.tipo_canal === 'CIDEF'),
    dealers_excluded_from_stores:
      storeResult.validation?.dealers_excluded_from_stores === true,
    store_to_cidef_reconciles: storeResult.validation?.cidef_delta_reconciles === true,
    cidef_delta_is_period_difference:
      storeResult.validation?.cidef_delta_is_period_difference === true,
    store_totals_match_store_motor: stores.every((row) => {
      const sourceStore = storeResult.stores.find((item) =>
        String(item.sucursal_id) === String(row.sucursal_id));
      return sourceStore?.sales_period_a === row.sales_period_a
        && sourceStore?.sales_period_b === row.sales_period_b
        && sourceStore?.delta_sales === row.delta_sales;
    }),
  };
  return {
    ...checks,
    store_reconciliations: reconciliations,
    ok: Object.values(checks).every(Boolean),
  };
}
