import { buildVentasCommercialContext } from '../ventas-commercial/buildVentasCommercialContext.js';
import { assembleOrganizationalContext } from './assembleOrganizationalContext.js';
import { buildOrganizationalSeries } from './buildOrganizationalSeries.js';
import { enrichRecognizedSales } from './enrichRecognizedSales.js';
import { loadOrganizationalIdentityMaps } from './loadOrganizationalIdentityMaps.js';

function monthlySales(sales) {
  const counts = new Map();
  for (const sale of sales) counts.set(sale.mes_venta, (counts.get(sale.mes_venta) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, salesCount]) => ({ month, sales: salesCount }));
}

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
      cutoff_month: ventasOptions.cutoffMonth,
    }),
    loadOrganizationalIdentityMaps(),
  ]);
  const cutoffMonth = ventasOptions.cutoffMonth
    ?? (ventasOptions.cutoffDate == null ? null : String(ventasOptions.cutoffDate).slice(0, 7));
  const ventasContext = {
    recognizedSales: commercialContext.sales,
    monthlySales: monthlySales(commercialContext.sales),
    cutoff_month: cutoffMonth,
    commercial_scope: commercialContext.commercial_scope,
    coverage: commercialContext.coverage,
    validation: { ok: commercialContext.validation.valid },
    warnings: commercialContext.validation.valid ? [] : ['Commercial scope validation failed'],
  };
  return calculateVentasOrganizationalContext(ventasContext, identityMaps, scope);
}
