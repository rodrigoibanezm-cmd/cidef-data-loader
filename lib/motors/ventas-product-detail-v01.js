import { aggregateSelectedProductSales } from '../ventas-product/aggregateProductSales.js';
import { buildVentasProductContext } from '../ventas-product/buildVentasProductContext.js';
import { parseProductPeriodInput } from '../ventas-product/parseProductPeriodInput.js';
import { selectProductSales } from '../ventas-product/selectProductSales.js';
import { serializeProductDetail } from '../ventas-product/serializeProductDetail.js';

export const ENGINE_NAME = 'ventas_product_detail_v01';
export const ENGINE_VERSION = '0.1';

export function calculateVentasProductDetail(context, parsed) {
  if (context.cutoff_month !== parsed.cutoffMonth) throw new Error('ventas product context cutoff mismatch');

  const selection = selectProductSales(context.resolvedSales, parsed);
  const aggregate = aggregateSelectedProductSales(selection);
  const detail = serializeProductDetail(selection.targetSales);
  const targetAliases = context.productAliases.filter((row) => Number(row.modelo_id) === parsed.modeloId);
  const noAmbiguity = aggregate.coverage.product_ambiguous === 0;
  const warnings = [];

  if (!targetAliases.length) warnings.push('No resolved ventas_raw product alias exists for requested modelo_id');
  if (aggregate.coverage.product_unresolved > 0) {
    warnings.push('Some recognized sales in the period remain outside resolved product identity');
  }
  if (!noAmbiguity) warnings.push('Ambiguous product identity exists inside requested period');

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.ventas_validation?.ok && targetAliases.length && noAmbiguity ? 'ok' : 'warning',
    inputs: {
      modelo_id: parsed.modeloId,
      start_month: parsed.startMonth,
      end_month: parsed.endMonth,
      cutoff_month: parsed.cutoffMonth,
    },
    policy: {
      recognition: 'ventas_context_v01 LAST-by-VIN inside cutoff before product identity',
      product_identity: 'resolved ventas_raw aliases from producto_aliases_v01; no fuzzy matching',
      detail: 'resolved target sales from the shared ventas_product_context_v01; no RAW reread',
      persistence: 'runtime only',
    },
    target: { modelo_id: parsed.modeloId, units: aggregate.units },
    detail,
    coverage: {
      ...aggregate.coverage,
      aliases_loaded: context.productAliases.length,
      target_aliases: targetAliases.length,
    },
    validation: {
      ventas_context_ok: context.ventas_validation?.ok === true,
      cutoff_context_match: context.cutoff_month === parsed.cutoffMonth,
      cutoff_equals_end_month: parsed.cutoffMonth === parsed.endMonth,
      target_model_aliases_present: targetAliases.length > 0,
      no_ambiguous_product_identity: noAmbiguity,
      product_identity_complete_in_period: aggregate.coverage.product_unresolved === 0,
      detail_units_reconcile_with_target: detail.length === aggregate.units,
      no_post_cutoff_evidence_used: true,
    },
    warnings,
  };
}

export async function ventasProductDetailV01(input = {}) {
  const parsed = parseProductPeriodInput(input);
  const context = await buildVentasProductContext({ cutoffMonth: parsed.cutoffMonth });
  return calculateVentasProductDetail(context, parsed);
}
