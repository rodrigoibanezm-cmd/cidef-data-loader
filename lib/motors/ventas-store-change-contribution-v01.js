import { parseChangeContributionInput } from '../product-change-contribution/parseInput.js';
import { rankContributions } from '../product-change-contribution/rankContributions.js';
import { aggregateStoreChange } from '../store-change-contribution/aggregatePeriods.js';
import { validateStoreContribution } from '../store-change-contribution/validateContribution.js';
import { buildVentasOrganizationalContext } from '../ventas-org/buildVentasOrganizationalContext.js';

export const ENGINE_NAME = 'ventas_store_change_contribution_v01';
export const ENGINE_VERSION = '0.1';

const pct = (n, d) => (d ? Number((100 * n / d).toFixed(2)) : null);

function coverage(period) {
  return {
    cidef_sales: period.cidefSales,
    resolved_store_sales: period.resolvedStoreSales,
    organizational_residual_sales: period.cidefSales - period.resolvedStoreSales,
    resolved_share_pct: pct(period.resolvedStoreSales, period.cidefSales),
  };
}

export function calculateStoreChangeContribution(context, parsed) {
  if (context.cutoff_month !== parsed.periodB) throw new Error('organizational context cutoff mismatch');
  const aggregate = aggregateStoreChange(context, parsed);
  const deltaCidef = aggregate.periodB.cidefSales - aggregate.periodA.cidefSales;
  const stores = rankContributions(aggregate.stores, deltaCidef, 'sucursal_id');
  const missingMetadataIds = stores.filter((row) => row.sucursal == null)
    .map((row) => row.sucursal_id);
  const validation = validateStoreContribution({ aggregate, stores, context, parsed, deltaCidef });
  const warnings = [];
  if (aggregate.organizationalResidual.total.sales_period_a
    || aggregate.organizationalResidual.total.sales_period_b) {
    warnings.push('Some recognized CIDEF sales remain outside a resolved CIDEF store');
  }
  if (missingMetadataIds.length) warnings.push('Some valid sucursal_id values lack canonical metadata');
  if (!context.validation?.ventas_context_reconciles) warnings.push('Source ventas context does not reconcile');
  const valid = Object.values(validation).every(Boolean);

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: valid && warnings.length === 0 ? 'ok' : 'warning',
    inputs: { period_a: parsed.periodA, period_b: parsed.periodB },
    policy: {
      grain: 'one row per resolved tipo_canal=CIDEF sucursal_id observed in period_a or period_b',
      cutoff_month: parsed.periodB,
      recognition: 'ventas_context_v01 LAST-by-VIN inside period_b cutoff before organizational identity',
      organizational_identity: 'ventas_organizational_context_v01 exact certified store identity and tipo_canal',
      residual_policy: 'unresolved, ambiguous and resolved non-CIDEF sales remain explicit; no fictitious store',
      contribution_semantics: '100 * store delta_sales / CIDEF delta_sales; null when CIDEF delta_sales is zero',
      ordering: 'ABS(delta_sales) DESC, sucursal_id ASC; no top-N',
    },
    cidef: {
      period_a_sales: aggregate.periodA.cidefSales,
      period_b_sales: aggregate.periodB.cidefSales,
      delta_sales: deltaCidef,
    },
    stores,
    organizational_residual: aggregate.organizationalResidual,
    coverage: {
      period_a: coverage(aggregate.periodA),
      period_b: coverage(aggregate.periodB),
      missing_store_metadata_ids: missingMetadataIds,
      source: context.coverage,
    },
    validation,
    warnings,
  };
}

export async function ventasStoreChangeContributionV01(input = {}) {
  const parsed = parseChangeContributionInput(input);
  const scope = { startMonth: parsed.periodA, endMonth: parsed.periodB };
  const context = await buildVentasOrganizationalContext(scope, { cutoffMonth: parsed.periodB });
  return calculateStoreChangeContribution(context, parsed);
}
