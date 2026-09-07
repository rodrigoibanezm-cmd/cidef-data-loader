import { buildVentasUniverse } from '../ventas-universe/buildVentasUniverse.js';

export async function buildProductModelResolutionContext({ cutoffMonth }) {
  const universe = await buildVentasUniverse({
    commercial_universe: 'COMPANY',
    cutoff_month: cutoffMonth,
  });
  return {
    context: 'product_model_resolution_context_v01',
    version: '0.1',
    cutoff_month: cutoffMonth,
    ventas_validation: universe.source_validation,
    ventas_coverage: universe.coverage.recognition,
    resolutionMap: universe.resolution_resources.product_model_resolution_map,
    modelCatalog: universe.resolution_resources.model_catalog,
    resolvedSales: universe.analytical_events,
    ventas_universe: universe,
  };
}
