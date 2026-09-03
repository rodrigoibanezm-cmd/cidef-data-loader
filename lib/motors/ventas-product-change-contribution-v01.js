import { aggregateChangePeriods } from '../product-change-contribution/aggregatePeriods.js';
import { parseProductChangeInput } from '../product-change-contribution/parseInput.js';
import { rankContributions } from '../product-change-contribution/rankContributions.js';
import { validateContribution } from '../product-change-contribution/validateContribution.js';
import { buildProductModelResolutionContext } from '../product-model-resolution/buildContext.js';

export const ENGINE_NAME = 'ventas_product_change_contribution_v01';
export const ENGINE_VERSION = '0.1';

const pct = (n, d) => (d ? Number((100 * n / d).toFixed(2)) : null);

function coverage(period) {
  return {
    cidef_sales: period.cidefSales,
    resolved_product_sales: period.resolvedProductSales,
    unresolved_product_sales: period.unresolvedProductSales,
    ambiguous_product_sales: period.ambiguousProductSales,
    resolved_share_pct: pct(period.resolvedProductSales, period.cidefSales),
  };
}

export function calculateProductChangeContribution(context, parsed) {
  if (context.cutoff_month !== parsed.periodB) throw new Error('product model resolution cutoff mismatch');
  const aggregate = aggregateChangePeriods(context.resolvedSales, context.modelCatalog, parsed);
  const deltaCidef = aggregate.periodB.cidefSales - aggregate.periodA.cidefSales;
  const models = rankContributions(aggregate.models, deltaCidef);
  const missingCatalogIds = models
    .filter((row) => row.marca == null || row.modelo == null)
    .map((row) => row.modelo_id);
  const ventasOk = Object.values(context.ventas_validation || {}).every((value) => value !== false);
  const cutoffMatches = context.cutoff_month === parsed.periodB;
  const validation = validateContribution({ aggregate, models, deltaCidef, cutoffMatches, ventasOk });
  const warnings = [];
  if (aggregate.periodA.unresolvedProductSales || aggregate.periodB.unresolvedProductSales) {
    warnings.push('Some recognized sales remain UNRESOLVED and are reported in identity_residual');
  }
  if (aggregate.periodA.ambiguousProductSales || aggregate.periodB.ambiguousProductSales) {
    warnings.push('Some recognized sales remain AMBIGUOUS and are reported in identity_residual');
  }
  if (missingCatalogIds.length) warnings.push('Some resolved modelo_id values lack canonical catalog metadata');
  const valid = Object.values(validation).every(Boolean);

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: valid && warnings.length === 0 ? 'ok' : 'warning',
    inputs: { period_a: parsed.periodA, period_b: parsed.periodB },
    policy: {
      grain: 'one row per RESOLVED modelo_id observed in period_a or period_b',
      cutoff_month: parsed.periodB,
      recognition: 'ventas_context_v01 LAST-by-VIN inside period_b cutoff before product identity',
      product_identity: 'ventas_product_concentration_v01 V0.2 model-resolution semantics: certified ventas alias, then deterministic exact VIN evidence',
      unresolved_policy: 'UNRESOLVED and AMBIGUOUS remain separate in identity_residual and are never assigned by inference',
      contribution_semantics: '100 * model delta_sales / CIDEF delta_sales; null when CIDEF delta_sales is zero',
      ordering: 'ABS(delta_sales) DESC, modelo_id ASC; no top-N',
    },
    cidef: {
      period_a_sales: aggregate.periodA.cidefSales,
      period_b_sales: aggregate.periodB.cidefSales,
      delta_sales: deltaCidef,
    },
    models,
    identity_residual: aggregate.identityResidual,
    coverage: {
      period_a: coverage(aggregate.periodA),
      period_b: coverage(aggregate.periodB),
      missing_catalog_model_ids: missingCatalogIds,
    },
    validation,
    warnings,
  };
}

export async function ventasProductChangeContributionV01(input = {}) {
  const parsed = parseProductChangeInput(input);
  const context = await buildProductModelResolutionContext({ cutoffMonth: parsed.periodB });
  return calculateProductChangeContribution(context, parsed);
}
