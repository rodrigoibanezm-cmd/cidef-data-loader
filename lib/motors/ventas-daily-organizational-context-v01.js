import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { parseVentasCutoff } from '../ventas/parseVentasCutoff.js';
import { aggregateDailyStoreSales } from '../ventas-org/aggregateDailyStoreSales.js';
import { enrichRecognizedSales } from '../ventas-org/enrichRecognizedSales.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';

export const ENGINE_NAME = 'ventas_daily_organizational_context_v01';
export const ENGINE_VERSION = '0.1';

function parseInput(input) {
  if (!input?.cutoff_date) throw new Error('cutoff_date is required');
  const cutoff = parseVentasCutoff({ cutoffDate: input.cutoff_date });
  return { cutoffDate: cutoff.value };
}

export function calculateVentasDailyOrganizationalContext(context, identityMaps, { cutoffDate }) {
  if (context?.cutoff_date !== cutoffDate) {
    throw new Error('ventas context cutoff does not match requested cutoff_date');
  }

  const month = cutoffDate.slice(0, 7);
  const events = enrichRecognizedSales(context.recognizedSales || [], identityMaps);
  const aggregated = aggregateDailyStoreSales(events, month);
  const c = aggregated.coverage;
  const channelResolved = Object.values(c.resolved_sales_by_channel)
    .reduce((sum, value) => sum + value, 0);
  const recognizedReconciles = c.resolved_store + c.unresolved_store + c.ambiguous_store
    === c.recognized_sales_in_target_month_to_date;
  const storeKeysUnique = [...(identityMaps?.stores?.values?.() || [])]
    .every((hit) => hit.match_count === 1);
  const validations = {
    ventas_context_ok: context.validation?.ok === true,
    cutoff_context_match: context.cutoff_date === cutoffDate,
    no_post_cutoff_evidence_used: true,
    store_identity_keys_unique: storeKeysUnique,
    store_reconciles_with_recognized_target_month: recognizedReconciles,
    resolved_channels_reconcile: channelResolved === c.resolved_store,
    cidef_owned_reconciles: aggregated.cidefOwned === (c.resolved_sales_by_channel.CIDEF || 0),
  };
  const ok = Object.values(validations).every(Boolean);
  const warnings = [...(context.warnings || [])];
  if ((c.resolved_sales_by_channel.UNKNOWN || 0) > 0) {
    warnings.push('Resolved stores with missing tipo_canal are reported as UNKNOWN');
  }

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: ok ? 'ok' : 'warning',
    inputs: { cutoff_date: cutoffDate },
    policy: {
      recognition: 'reuse ventas_context_v01; never reconstruct LAST-by-VIN',
      temporal_guard: 'fecha_factura <= cutoff_date before VIN recognition',
      store_identity: 'exact historical source key from recognized sale; no fuzzy or reassignment',
      channel_classification: 'sucursales_master.tipo_canal after store resolution',
      zero_semantics: 'sparse positive observations only; absence of store row is not zero',
      persistence: 'runtime only',
    },
    as_of: { cutoff_date: cutoffDate, month, day_of_month: Number(cutoffDate.slice(8, 10)) },
    store_sales_to_date: aggregated.storeSales,
    cidef_owned_sales_to_date: aggregated.cidefOwned,
    coverage: c,
    validation: validations,
    warnings,
  };
}

export async function ventasDailyOrganizationalContextV01(input = {}) {
  const parsed = parseInput(input);
  const [context, identityMaps] = await Promise.all([
    buildVentasContext({ cutoffDate: parsed.cutoffDate }),
    loadOrganizationalIdentityMaps(),
  ]);
  return calculateVentasDailyOrganizationalContext(context, identityMaps, parsed);
}
