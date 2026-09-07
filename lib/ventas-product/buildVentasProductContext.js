import { buildVentasUniverse } from '../ventas-universe/buildVentasUniverse.js';

export async function buildVentasProductContext({ cutoffMonth }) {
  const universe = await buildVentasUniverse({
    commercial_universe: 'COMPANY',
    cutoff_month: cutoffMonth,
  });
  const aliasRows = universe.resolution_resources.product_aliases;
  const resolvedSales = universe.analytical_events.map((row) => ({
    ...row,
    product_identity_status: row.alias_product_identity_status,
    modelo_id: row.alias_modelo_id,
    version_id: row.alias_version_id,
  }));

  return {
    context: 'ventas_product_context_v01',
    version: '0.1',
    cutoff_month: cutoffMonth,
    ventas_validation: universe.source_validation,
    ventas_coverage: universe.coverage.recognition,
    productAliases: aliasRows,
    resolvedSales,
    ventas_universe: universe,
  };
}
