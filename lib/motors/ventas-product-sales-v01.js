import { shiftMonth } from '../expectation/monthSeries.js';
import { aggregateProductSales } from '../ventas-product/aggregateProductSales.js';
import { buildVentasProductContext } from '../ventas-product/buildVentasProductContext.js';

export const ENGINE_NAME = 'ventas_product_sales_v01';
export const ENGINE_VERSION = '0.1';

function parseInput(input) {
  const modeloId = Number(input?.modelo_id);
  const startMonth = String(input?.start_month || '');
  const endMonth = String(input?.end_month || '');
  const cutoffMonth = String(input?.cutoff_month || '');
  if (!Number.isInteger(modeloId) || modeloId < 1) throw new Error('Invalid modelo_id');
  if (!shiftMonth(startMonth, 0)) throw new Error('Invalid start_month; expected YYYY-MM');
  if (!shiftMonth(endMonth, 0)) throw new Error('Invalid end_month; expected YYYY-MM');
  if (!shiftMonth(cutoffMonth, 0)) throw new Error('Invalid cutoff_month; expected YYYY-MM');
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  if (cutoffMonth !== endMonth) throw new Error('cutoff_month must equal end_month');
  return { modeloId, startMonth, endMonth, cutoffMonth };
}

export function calculateVentasProductSales(context, parsed) {
  if (context.cutoff_month !== parsed.cutoffMonth) throw new Error('ventas product context cutoff mismatch');
  const result = aggregateProductSales(context.resolvedSales, parsed);
  const targetAliases = context.productAliases.filter((row) => Number(row.modelo_id) === parsed.modeloId);
  const complete = result.coverage.product_unresolved === 0 && result.coverage.product_ambiguous === 0;
  const warnings = [];
  if (!targetAliases.length) warnings.push('No resolved ventas_raw product alias exists for requested modelo_id');
  if (!complete) warnings.push('Product identity coverage is incomplete inside requested period');

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.ventas_validation?.ok && targetAliases.length && complete ? 'ok' : 'warning',
    inputs: {
      modelo_id: parsed.modeloId,
      start_month: parsed.startMonth,
      end_month: parsed.endMonth,
      cutoff_month: parsed.cutoffMonth,
    },
    policy: {
      recognition: 'ventas_context_v01 LAST-by-VIN inside cutoff before product identity',
      product_identity: 'resolved ventas_raw aliases from producto_aliases_v01; no fuzzy matching',
      persistence: 'runtime only',
    },
    target: { modelo_id: parsed.modeloId, units: result.units, monthly_sales: result.monthly_sales },
    coverage: {
      ...result.coverage,
      aliases_loaded: context.productAliases.length,
      target_aliases: targetAliases.length,
    },
    validation: {
      ventas_context_ok: context.ventas_validation?.ok === true,
      cutoff_context_match: context.cutoff_month === parsed.cutoffMonth,
      cutoff_equals_end_month: parsed.cutoffMonth === parsed.endMonth,
      target_model_aliases_present: targetAliases.length > 0,
      no_ambiguous_product_identity: result.coverage.product_ambiguous === 0,
      product_identity_complete_in_period: result.coverage.product_unresolved === 0,
      no_post_cutoff_evidence_used: true,
    },
    warnings,
  };
}

export async function ventasProductSalesV01(input = {}) {
  const parsed = parseInput(input);
  const context = await buildVentasProductContext({ cutoffMonth: parsed.cutoffMonth });
  return calculateVentasProductSales(context, parsed);
}
