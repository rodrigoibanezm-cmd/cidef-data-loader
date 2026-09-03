const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);

export function validateStoreContribution({ aggregate, stores, context, parsed, deltaCidef }) {
  const { periodA, periodB, organizationalResidual } = aggregate;
  const ids = stores.map((row) => String(row.sucursal_id));
  const outputIds = new Set(ids);
  const sourceRows = (context.store_monthly || []).filter((row) =>
    [parsed.periodA, parsed.periodB].includes(row.month)
      && outputIds.has(String(row.sucursal_id)));
  const cutoffMatches = context.cutoff_month === parsed.periodB
    && context.temporal_evidence?.cutoff_month === parsed.periodB;
  return {
    ventas_context_ok: context.validation?.ventas_context_reconciles === true,
    cidef_matches_organizational_context:
      context.validation?.monthly_cidef_reconciles_with_ventas_context === true,
    cutoff_equals_period_b: cutoffMatches,
    no_post_cutoff_evidence_used: cutoffMatches
      && context.temporal_evidence?.recognized_sales_after_cutoff === 0,
    cidef_period_a_reconciles: periodA.cidefSales
      === periodA.resolvedStoreSales + organizationalResidual.total.sales_period_a,
    cidef_period_b_reconciles: periodB.cidefSales
      === periodB.resolvedStoreSales + organizationalResidual.total.sales_period_b,
    stores_period_a_reconcile: sum(stores, 'sales_period_a') === periodA.resolvedStoreSales,
    stores_period_b_reconcile: sum(stores, 'sales_period_b') === periodB.resolvedStoreSales,
    store_delta_reconciles: sum(stores, 'delta_sales')
      === periodB.resolvedStoreSales - periodA.resolvedStoreSales,
    organizational_residual_reconciles: organizationalResidual.total.delta_sales
      === organizationalResidual.total.sales_period_b - organizationalResidual.total.sales_period_a,
    cidef_delta_reconciles: deltaCidef
      === sum(stores, 'delta_sales') + organizationalResidual.total.delta_sales,
    cidef_delta_is_period_difference: deltaCidef === periodB.cidefSales - periodA.cidefSales,
    unique_sucursal_id: new Set(ids).size === ids.length,
    stores_only_cidef: sourceRows.length === stores.filter((row) =>
      row.sales_period_a > 0).length + stores.filter((row) => row.sales_period_b > 0).length
      && sourceRows.every((row) => row.tipo_canal === 'CIDEF'),
    dealers_excluded_from_stores: sourceRows.every((row) => ![
      'DEALER', 'DEALER_AGREGADO', 'NO_COMERCIAL',
    ].includes(row.tipo_canal)),
  };
}
