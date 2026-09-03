function emptyPeriod() {
  return {
    cidefSales: 0,
    resolvedProductSales: 0,
    ambiguousProductSales: 0,
    unresolvedProductSales: 0,
    modelCounts: new Map(),
    resolvedRowsHaveModel: true,
  };
}

function addSale(period, sale) {
  period.cidefSales += 1;
  if (sale.product_identity_status === 'AMBIGUOUS') {
    period.ambiguousProductSales += 1;
    return;
  }
  if (sale.product_identity_status !== 'RESOLVED') {
    period.unresolvedProductSales += 1;
    return;
  }

  period.resolvedProductSales += 1;
  const modeloId = Number(sale.modelo_id);
  if (!Number.isFinite(modeloId)) {
    period.resolvedRowsHaveModel = false;
    return;
  }
  period.modelCounts.set(modeloId, (period.modelCounts.get(modeloId) || 0) + 1);
}

function catalogIndex(rows = []) {
  return new Map(rows.map((row) => [Number(row.modelo_id), row]));
}

function residual(periodA, periodB, key) {
  const salesA = periodA[key];
  const salesB = periodB[key];
  return { sales_period_a: salesA, sales_period_b: salesB, delta_sales: salesB - salesA };
}

export function aggregateChangePeriods(sales = [], catalogRows = [], parsed) {
  const periodA = emptyPeriod();
  const periodB = emptyPeriod();
  for (const sale of sales) {
    if (sale.mes_venta === parsed.periodA) addSale(periodA, sale);
    if (sale.mes_venta === parsed.periodB) addSale(periodB, sale);
  }

  const catalog = catalogIndex(catalogRows);
  const modelIds = new Set([...periodA.modelCounts.keys(), ...periodB.modelCounts.keys()]);
  const models = [...modelIds].map((modeloId) => {
    const salesA = periodA.modelCounts.get(modeloId) || 0;
    const salesB = periodB.modelCounts.get(modeloId) || 0;
    const metadata = catalog.get(modeloId);
    return {
      modelo_id: modeloId,
      marca: metadata?.marca ?? null,
      modelo: metadata?.modelo ?? null,
      sales_period_a: salesA,
      sales_period_b: salesB,
      delta_sales: salesB - salesA,
    };
  });
  const unresolved = residual(periodA, periodB, 'unresolvedProductSales');
  const ambiguous = residual(periodA, periodB, 'ambiguousProductSales');
  return {
    periodA,
    periodB,
    models,
    identityResidual: {
      unresolved,
      ambiguous,
      total: {
        sales_period_a: unresolved.sales_period_a + ambiguous.sales_period_a,
        sales_period_b: unresolved.sales_period_b + ambiguous.sales_period_b,
        delta_sales: unresolved.delta_sales + ambiguous.delta_sales,
      },
    },
  };
}
