import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { loadProductIdentityMap } from './loadProductIdentityMap.js';
import { resolveSalesProducts } from './resolveSaleProduct.js';

export async function buildVentasProductContext({ cutoffMonth }) {
  const [ventasContext, aliasRows] = await Promise.all([
    buildVentasContext({ cutoffMonth }),
    loadProductIdentityMap(),
  ]);
  const resolvedSales = resolveSalesProducts(ventasContext.recognizedSales, aliasRows);

  return {
    context: 'ventas_product_context_v01',
    version: '0.1',
    cutoff_month: cutoffMonth,
    ventas_validation: ventasContext.validation,
    ventas_coverage: ventasContext.coverage,
    productAliases: aliasRows,
    resolvedSales,
  };
}
