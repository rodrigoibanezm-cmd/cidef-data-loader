import { buildProductModelResolutionContext } from '../product-model-resolution/buildContext.js';
import { parseProductModelResolutionInput } from '../product-model-resolution/parseInput.js';

export const ENGINE_NAME = 'ventas_product_model_resolution_v01';
export const ENGINE_VERSION = '0.1';

function pct(n, d) {
  return d ? Math.round((10000 * n) / d) / 100 : null;
}

function summarizeMappings(resolutionMap, modelCatalog) {
  const catalog = new Map(modelCatalog.map((row) => [Number(row.modelo_id), row]));
  return [...resolutionMap.values()].map((row) => {
    const model = row.modelo_id ? catalog.get(Number(row.modelo_id)) : null;
    return {
      sku: row.sku,
      desc_articulo: row.desc_articulo,
      marca_raw: row.marca_raw,
      status: row.status,
      modelo_id: row.modelo_id,
      marca: model?.marca || null,
      modelo: model?.modelo || null,
      resolution_method: row.resolution_method,
      evidence_vins: row.canonical_vins + row.rvm_vins,
      canonical_vins: row.canonical_vins,
      rvm_vins: row.rvm_vins,
      ambiguous_vins: row.ambiguous_vins,
      no_evidence_vins: row.no_evidence_vins,
      source_conflict_vins: row.source_conflict_vins,
    };
  }).sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
}

export async function ventasProductModelResolutionV01(input = {}) {
  const parsed = parseProductModelResolutionInput(input);
  const context = await buildProductModelResolutionContext({ cutoffMonth: parsed.endMonth });
  const sales = context.resolvedSales.filter((row) => row.mes_venta >= parsed.startMonth && row.mes_venta <= parsed.endMonth);
  const mappings = summarizeMappings(context.resolutionMap, context.modelCatalog);
  const resolved = sales.filter((row) => row.product_identity_status === 'RESOLVED');
  const ambiguous = sales.filter((row) => row.product_identity_status === 'AMBIGUOUS');
  const unresolved = sales.length - resolved.length - ambiguous.length;
  const mappingResolved = mappings.filter((row) => row.status === 'RESOLVED').length;
  const mappingAmbiguous = mappings.filter((row) => row.status === 'AMBIGUOUS').length;
  const sourceCounts = resolved.reduce((acc, row) => {
    const key = row.product_resolution_method || 'UNKNOWN';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: ambiguous === 0 && unresolved === 0 ? 'ok' : 'warning',
    inputs: { start_month: parsed.startMonth, end_month: parsed.endMonth },
    policy: {
      grain: 'ventas_raw technical SKU -> canonical modelo_id',
      recognition: 'ventas_context_v01 LAST-by-VIN before product identity',
      precedence: 'certified ventas_raw alias, then exact VIN evidence from vehiculo_canonico, then certified RVM model identity',
      acceptance: 'fallback SKU resolves only when all effective exact-VIN evidence converges to one modelo_id and no unresolved RVM ambiguity remains',
      no_fuzzy: true,
      no_substring: true,
      no_majority_vote: true,
      master_writes: false,
    },
    coverage: {
      recognized_sales: sales.length,
      resolved_model_sales: resolved.length,
      ambiguous_model_sales: ambiguous.length,
      unresolved_model_sales: unresolved,
      resolved_share_pct: pct(resolved.length, sales.length),
      resolution_sources: sourceCounts,
      total_skus: mappings.length,
      resolved_skus: mappingResolved,
      ambiguous_skus: mappingAmbiguous,
      unresolved_skus: mappings.length - mappingResolved - mappingAmbiguous,
    },
    mappings,
    validation: {
      ventas_context_ok: Object.values(context.ventas_validation || {}).every((value) => value !== false),
      arithmetic_reconciles: resolved.length + ambiguous.length + unresolved === sales.length,
      resolved_rows_have_model: resolved.every((row) => Number.isFinite(Number(row.modelo_id))),
      ambiguous_rows_have_no_model: ambiguous.every((row) => row.modelo_id == null),
    },
    warnings: [
      ...(ambiguous ? ['Some recognized sales remain ambiguous at model identity'] : []),
      ...(unresolved ? ['Some recognized sales remain unresolved at model identity'] : []),
    ],
  };
}
