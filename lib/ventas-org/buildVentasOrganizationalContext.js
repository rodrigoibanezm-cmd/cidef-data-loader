import { buildVentasContext } from '../ventas/buildVentasContext.js';
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
  return assembleOrganizationalContext(ventasContext, series, scope);
}

export async function buildVentasOrganizationalContext(scope) {
  const [ventasContext, identityMaps] = await Promise.all([
    buildVentasContext(),
    loadOrganizationalIdentityMaps(),
  ]);
  return calculateVentasOrganizationalContext(ventasContext, identityMaps, scope);
}
