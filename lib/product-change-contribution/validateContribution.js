const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);

export function validateContribution({ aggregate, models, deltaCidef, cutoffMatches, ventasOk }) {
  const { periodA, periodB, identityResidual } = aggregate;
  const ids = models.map((row) => row.modelo_id);
  const resolvedA = periodA.resolvedProductSales;
  const resolvedB = periodB.resolvedProductSales;
  return {
    ventas_context_ok: ventasOk,
    cutoff_equals_period_b: cutoffMatches,
    no_post_cutoff_evidence_used: cutoffMatches,
    cidef_period_a_reconciles: periodA.cidefSales === resolvedA
      + periodA.unresolvedProductSales + periodA.ambiguousProductSales,
    cidef_period_b_reconciles: periodB.cidefSales === resolvedB
      + periodB.unresolvedProductSales + periodB.ambiguousProductSales,
    models_period_a_reconcile: sum(models, 'sales_period_a') === resolvedA,
    models_period_b_reconcile: sum(models, 'sales_period_b') === resolvedB,
    model_delta_reconciles: sum(models, 'delta_sales') === resolvedB - resolvedA,
    identity_residual_reconciles: identityResidual.total.delta_sales
      === identityResidual.unresolved.delta_sales + identityResidual.ambiguous.delta_sales,
    cidef_delta_reconciles: deltaCidef === sum(models, 'delta_sales')
      + identityResidual.total.delta_sales,
    cidef_delta_is_period_difference: deltaCidef === periodB.cidefSales - periodA.cidefSales,
    unique_modelo_id: new Set(ids).size === ids.length,
    resolved_rows_have_modelo_id: periodA.resolvedRowsHaveModel && periodB.resolvedRowsHaveModel,
    models_only_contain_resolved_identity: periodA.resolvedRowsHaveModel && periodB.resolvedRowsHaveModel,
  };
}
