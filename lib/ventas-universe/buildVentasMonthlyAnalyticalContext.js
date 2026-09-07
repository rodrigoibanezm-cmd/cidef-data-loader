import { buildMonthlySales } from '../ventas/buildMonthlySales.js';
import { buildVentasUniverse } from './buildVentasUniverse.js';

export function ventasContextFromUniverse(universe) {
  if (universe?.commercial_universe !== 'COMPANY') {
    throw new Error('COMPANY ventas_universe_v01 is required');
  }
  if (!Array.isArray(universe.analytical_events)) {
    throw new Error('ventas_universe_v01 analytical_events are required');
  }

  return {
    context: 'ventas_context_v01',
    version: universe.recognition_version,
    policy: universe.recognition_policy,
    cutoff_month: universe.period?.cutoff_month ?? null,
    cutoff_date: universe.period?.cutoff_date ?? null,
    coverage: universe.coverage?.recognition ?? null,
    recognizedSales: universe.analytical_events,
    monthlySales: buildMonthlySales(universe.analytical_events),
    validation: universe.source_validation,
    warnings: universe.warnings ?? [],
  };
}

export async function buildVentasMonthlyAnalyticalContext(options = {}) {
  const universe = await buildVentasUniverse({
    commercial_universe: 'COMPANY',
    cutoff_month: options.cutoffMonth ?? options.cutoff_month ?? null,
    cutoff_date: options.cutoffDate ?? options.cutoff_date ?? null,
  });
  return ventasContextFromUniverse(universe);
}
