import { buildVentasCommercialContext } from '../ventas-commercial/buildVentasCommercialContext.js';
import { assembleOrganizationalContext } from './assembleOrganizationalContext.js';
import { buildOrganizationalSeries } from './buildOrganizationalSeries.js';
import { enrichRecognizedSales } from './enrichRecognizedSales.js';
import { loadOrganizationalIdentityMaps } from './loadOrganizationalIdentityMaps.js';

export function calculateVentasOrganizationalContext(ventasContext, identityMaps, scope) {
  if (!Array.isArray(ventasContext?.recognizedSales)) {
    throw new Error('ventas_context_v01 with recognizedSales is required');
  }
  const events = enrichRecognizedSales(ventasContext.recognizedSales, identityMaps);
  const series = buildOrganizationalSeries(events, scope);
  const output = assembleOrganizationalContext(ventasContext, series, scope);
  return {
    ...output,
    commercial_scope: ventasContext.commercial_scope ?? null,
  };
}

export async function buildVentasOrganizationalContext(scope, ventasOptions = {}) {
  const [commercialContext, identityMaps] = await Promise.all([
    buildVentasCommercialContext({
      commercial_universe: 'OWN_STORES',
      cutoff_date: ventasOptions.cutoffDate,
    }),
    loadOrganizationalIdentityMaps(),
  ]);
  const ventasContext = {
    recognizedSales: commercialContext.sales,
    commercial_scope: commercialContext.commercial_scope,
    coverage: commercialContext.coverage,
    validation: commercialContext.validation,
  };
  return calculateVentasOrganizationalContext(ventasContext, identityMaps, scope);
}
