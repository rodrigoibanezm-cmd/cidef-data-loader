function inPeriod(sale, startMonth, endMonth) {
  return sale.mes_venta >= startMonth && sale.mes_venta <= endMonth;
}

export function aggregateProductSales(resolvedSales, { modeloId, startMonth, endMonth }) {
  const periodSales = resolvedSales.filter((sale) => inPeriod(sale, startMonth, endMonth));
  const targetSales = periodSales.filter(
    (sale) => sale.product_identity_status === 'RESOLVED' && sale.modelo_id === modeloId,
  );
  const monthly = new Map();
  for (const sale of targetSales) {
    monthly.set(sale.mes_venta, (monthly.get(sale.mes_venta) || 0) + 1);
  }

  const resolved = periodSales.filter((sale) => sale.product_identity_status === 'RESOLVED').length;
  const ambiguous = periodSales.filter((sale) => sale.product_identity_status === 'AMBIGUOUS').length;
  const unresolved = periodSales.length - resolved - ambiguous;

  return {
    units: targetSales.length,
    monthly_sales: [...monthly.entries()].map(([month, sales]) => ({ month, sales })),
    coverage: {
      recognized_sales_in_period: periodSales.length,
      product_resolved: resolved,
      product_ambiguous: ambiguous,
      product_unresolved: unresolved,
    },
  };
}
