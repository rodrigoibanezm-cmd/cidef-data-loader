import { buildVentasUniverse } from '../ventas-universe/buildVentasUniverse.js';
import { assembleOrganizationalContext } from './assembleOrganizationalContext.js';
import { buildOrganizationalSeries } from './buildOrganizationalSeries.js';
import { enrichRecognizedSales } from './enrichRecognizedSales.js';

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
  return calculateEnrichedVentasOrganizationalContext(ventasContext, events, scope);
}

export function calculateEnrichedVentasOrganizationalContext(ventasContext, events, scope) {
  const series = buildOrganizationalSeries(events, scope);
  const output = assembleOrganizationalContext(ventasContext, series, scope);
  return {
    ...output,
    commercial_scope: ventasContext.commercial_scope ?? null,
  };
}

export async function buildVentasOrganizationalContext(scope, ventasOptions = {}) {
  const universe = await buildVentasUniverse({
    commercial_universe: 'OWN_STORES',
    cutoff_date: ventasOptions.cutoffDate,
    cutoff_month: ventasOptions.cutoffMonth,
  });
  const cutoffMonth = ventasOptions.cutoffMonth
    ?? (ventasOptions.cutoffDate == null ? null : String(ventasOptions.cutoffDate).slice(0, 7));
  const ventasContext = {
    recognizedSales: universe.analytical_events,
    monthlySales: monthlySales(universe.analytical_events),
    cutoff_month: cutoffMonth,
    commercial_scope: universe.commercial_scope,
    coverage: universe.coverage.commercial,
    validation: { ok: universe.validation.commercial_scope_valid },
    warnings: universe.validation.commercial_scope_valid
      ? []
      : ['Commercial scope validation failed'],
  };
  return calculateEnrichedVentasOrganizationalContext(
    ventasContext,
    universe.analytical_events,
    scope,
  );
}
