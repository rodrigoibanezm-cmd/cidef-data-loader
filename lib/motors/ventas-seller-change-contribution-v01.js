import { parseChangeContributionInput } from '../product-change-contribution/parseInput.js';
import { aggregateSellerChange } from '../seller-change-contribution/aggregatePeriods.js';
import { rankSellerContributions } from '../seller-change-contribution/rankSellers.js';
import { validateSellerContribution } from '../seller-change-contribution/validateContribution.js';
import { calculateStoreChangeContribution } from './ventas-store-change-contribution-v01.js';
import { buildVentasOrganizationalContext } from '../ventas-org/buildVentasOrganizationalContext.js';

export const ENGINE_NAME = 'ventas_seller_change_contribution_v01';
export const ENGINE_VERSION = '0.1';

function missingMetadata(stores) {
  return {
    store_ids: stores.filter((row) => row.sucursal == null).map((row) => row.sucursal_id),
    seller_ids: [...new Set(stores.flatMap((store) => store.sellers
      .filter((row) => row.vendedor == null).map((row) => row.persona_id)))],
  };
}

function warningsFor(stores, storeResult, missing) {
  const warnings = [];
  if (stores.some((row) => row.seller_residual.sales_period_a
    || row.seller_residual.sales_period_b)) {
    warnings.push('Some CIDEF store sales remain outside a date-effective seller assignment');
  }
  if (storeResult.organizational_residual.total.sales_period_a
    || storeResult.organizational_residual.total.sales_period_b) {
    warnings.push('Some recognized CIDEF sales remain outside a resolved CIDEF store');
  }
  if (missing.store_ids.length) warnings.push('Some valid sucursal_id values lack canonical metadata');
  if (missing.seller_ids.length) warnings.push('Some valid persona_id values lack canonical metadata');
  return warnings;
}

export function calculateSellerChangeContribution(context, parsed) {
  if (context.cutoff_month !== parsed.periodB) throw new Error('organizational context cutoff mismatch');
  const storeResult = calculateStoreChangeContribution(context, parsed);
  const baseStores = aggregateSellerChange(context, parsed, storeResult);
  const stores = rankSellerContributions(baseStores, storeResult.cidef.delta_sales);
  const validation = validateSellerContribution({ context, parsed, storeResult, stores });
  const missing = missingMetadata(stores);
  const warnings = warningsFor(stores, storeResult, missing);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: validation.ok && warnings.length === 0 ? 'ok' : 'warning',
    inputs: { period_a: parsed.periodA, period_b: parsed.periodB },
    policy: {
      grain: 'sucursal_id x persona_id, preserving temporal seller-to-store membership',
      cutoff_month: parsed.periodB,
      seller_universe: 'resolved persona with date-effective VENDEDOR_TIENDA role and assignment to the observed CIDEF store',
      temporal_membership: 'valid_from/valid_to evaluated on each recognized sale date; current vigente never rewrites history',
      organizational_identity: 'ventas_organizational_context_v01 exact certified person and store identity',
      residual_policy: 'unresolved, ambiguous, non-seller and store-mismatch sales remain explicit by CIDEF store',
      contribution_semantics: 'signed seller delta divided by store delta and CIDEF delta; null when the respective delta is zero',
      ordering: 'within each store ABS(delta_sales) DESC, persona_id ASC; no top-N',
    },
    cidef: storeResult.cidef,
    stores,
    organizational_residual: storeResult.organizational_residual,
    coverage: {
      stores_total: stores.length,
      seller_store_rows_total: stores.reduce((sum, row) => sum + row.sellers.length, 0),
      seller_residual_period_a: stores.reduce((sum, row) =>
        sum + row.seller_residual.sales_period_a, 0),
      seller_residual_period_b: stores.reduce((sum, row) =>
        sum + row.seller_residual.sales_period_b, 0),
      missing_store_metadata_ids: missing.store_ids,
      missing_seller_metadata_ids: missing.seller_ids,
      source: context.coverage,
    },
    validation,
    warnings,
  };
}

export async function ventasSellerChangeContributionV01(input = {}) {
  const parsed = parseChangeContributionInput(input);
  const context = await buildVentasOrganizationalContext(
    { startMonth: parsed.periodA, endMonth: parsed.periodB },
    { cutoffMonth: parsed.periodB },
  );
  return calculateSellerChangeContribution(context, parsed);
}
