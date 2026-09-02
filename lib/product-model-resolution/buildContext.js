import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { loadProductIdentityMap } from '../ventas-product/loadProductIdentityMap.js';
import { loadModelCatalog } from '../product-concentration/loadModelCatalog.js';
import { buildProductModelResolutionMap } from './buildResolutionMap.js';
import { loadSkuEvidence } from './loadSkuEvidence.js';
import { resolveSalesModels } from './resolveSalesModels.js';

export async function buildProductModelResolutionContext({ cutoffMonth }) {
  const [ventasContext, aliases, evidenceRows, modelCatalog] = await Promise.all([
    buildVentasContext({ cutoffMonth }),
    loadProductIdentityMap(),
    loadSkuEvidence(),
    loadModelCatalog(),
  ]);
  const resolutionMap = buildProductModelResolutionMap(evidenceRows, aliases);
  return {
    context: 'product_model_resolution_context_v01',
    version: '0.1',
    cutoff_month: cutoffMonth,
    ventas_validation: ventasContext.validation,
    ventas_coverage: ventasContext.coverage,
    resolutionMap,
    modelCatalog,
    resolvedSales: resolveSalesModels(ventasContext.recognizedSales, resolutionMap),
  };
}
