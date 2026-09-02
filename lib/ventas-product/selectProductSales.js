function inPeriod(sale, startMonth, endMonth) {
  return sale.mes_venta >= startMonth && sale.mes_venta <= endMonth;
}

export function selectProductSales(resolvedSales = [], { modeloId, startMonth, endMonth }) {
  const periodSales = resolvedSales.filter((sale) => inPeriod(sale, startMonth, endMonth));
  const targetSales = periodSales.filter(
    (sale) => sale.product_identity_status === 'RESOLVED' && sale.modelo_id === modeloId,
  );

  return { periodSales, targetSales };
}
