import { buildConcentration } from '../product-concentration/buildConcentration.js';
import { parseConcentrationInput } from '../product-concentration/parseConcentrationInput.js';
import { buildProductModelResolutionContext } from '../product-model-resolution/buildContext.js';

export const ENGINE_NAME = 'ventas_product_concentration_v01';
export const ENGINE_VERSION = '0.2';

function compact(row) {
  const { all_models, ...rest } = row;
  return rest;
}

export function calculateProductConcentration(context, modelCatalog, parsed) {
  if (context.cutoff_month !== parsed.endMonth) throw new Error('product model resolution cutoff mismatch');
  const result = buildConcentration(context.resolvedSales, modelCatalog, parsed);
  const warnings = [];
  if (result.coverage.product_unresolved > 0) warnings.push('Some recognized sales lack resolved model identity and are excluded from the Pareto denominator');
  if (result.coverage.product_ambiguous > 0) warnings.push('Ambiguous product identity exists and is excluded from the Pareto denominator');
  if (!result.validation.model_catalog_complete) warnings.push('Some resolved modelo_id values lack canonical catalog metadata');
  const ventasOk = Object.values(context.ventas_validation || {}).every((value) => value !== false);
  const validationsOk = ventasOk && Object.values(result.validation).every(Boolean);

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: validationsOk && warnings.length === 0 ? 'ok' : 'warning',
    inputs: {
      start_month: parsed.startMonth,
      end_month: parsed.endMonth,
      pareto_threshold_pct: parsed.thresholdPct,
    },
    policy: {
      family: 'Familia 3 - DETERIORO Y RED FLAGS',
      question: 'Que tan concentrada esta la venta en pocos modelos y como cambia esa concentracion en el tiempo?',
      recognition: 'ventas_context_v01 LAST-by-VIN inside end_month cutoff before product identity',
      product_identity: 'ventas_product_model_resolution_v01 semantics: certified ventas alias, then exact VIN evidence; no fuzzy, substring or majority vote',
      denominator: 'resolved model sales only; unresolved and ambiguous sales remain explicit in coverage',
      pareto: 'rank models by sales descending and include through the first model that reaches the caller threshold',
      persistence: 'runtime only; no table or materialized concentration history',
    },
    period: compact(result.period),
    monthly: result.monthly.map(compact),
    coverage: result.coverage,
    validation: {
      ventas_context_ok: ventasOk,
      cutoff_equals_end_month: context.cutoff_month === parsed.endMonth,
      ...result.validation,
    },
    warnings,
  };
}

export async function ventasProductConcentrationV01(input = {}) {
  const parsed = parseConcentrationInput(input);
  const context = await buildProductModelResolutionContext({ cutoffMonth: parsed.endMonth });
  return calculateProductConcentration(context, context.modelCatalog, parsed);
}
