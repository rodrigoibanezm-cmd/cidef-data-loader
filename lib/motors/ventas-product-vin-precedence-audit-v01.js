import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { customGptDb } from '../custom-gpt/db.js';
import { loadProductIdentityMap } from '../ventas-product/loadProductIdentityMap.js';
import { resolveSalesProducts } from '../ventas-product/resolveSaleProduct.js';

export const ENGINE_NAME = 'ventas_product_vin_precedence_audit_v01';
export const ENGINE_VERSION = '0.2';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function norm(value) {
  if (value == null) return null;
  const text = String(value).trim().toUpperCase();
  return text || null;
}

function parseInput(input = {}) {
  const startMonth = String(input.start_month || '');
  const endMonth = String(input.end_month || '');
  if (!MONTH_RE.test(startMonth) || !MONTH_RE.test(endMonth)) throw new Error('start_month and end_month must use YYYY-MM');
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  return { startMonth, endMonth };
}

function pct(n, d) {
  return d ? Math.round((10000 * n) / d) / 100 : null;
}

async function loadVinEvidence(sql = customGptDb()) {
  return sql.query(`
    WITH source_vins AS MATERIALIZED (
      SELECT DISTINCT upper(trim(nro_vin_chasis)) AS vin_norm
      FROM ventas_raw
      WHERE nullif(trim(nro_vin_chasis),'') IS NOT NULL
    ),
    canonical_by_vin AS MATERIALIZED (
      SELECT s.vin_norm, v.modelo_id AS canonical_modelo_id
      FROM source_vins s
      JOIN vehiculo_canonico vc ON upper(trim(vc.vin))=s.vin_norm
      JOIN versiones_master_v01 v ON v.version_id=vc.version_id
      WHERE vc.version_id IS NOT NULL
    ),
    model_aliases_ranked AS MATERIALIZED (
      SELECT a.*,
        master_norm(a.contexto_marca_raw) AS context_brand_norm,
        master_norm(a.contexto_modelo_raw) AS context_model_norm,
        row_number() OVER (
          PARTITION BY a.valor_normalizado, master_norm(a.contexto_marca_raw), master_norm(a.contexto_modelo_raw)
          ORDER BY CASE a.estado WHEN 'RESUELTO' THEN 1 WHEN 'AMBIGUO' THEN 2 ELSE 3 END, a.alias_id
        ) AS rn
      FROM producto_aliases_v01 a
      WHERE a.nivel='MODELO' AND a.fuente='rvm_raw'
    ),
    model_aliases AS MATERIALIZED (
      SELECT * FROM model_aliases_ranked WHERE rn=1
    ),
    rvm_scoped AS MATERIALIZED (
      SELECT s.vin_norm,
        master_norm(r.marca) AS raw_brand_norm,
        master_norm(r.modelo_homologado) AS raw_model_norm,
        master_norm(r.modeo_version) AS raw_version_norm
      FROM source_vins s
      JOIN rvm_raw r ON upper(trim(r.vin))=s.vin_norm
    ),
    rvm_resolved AS MATERIALIZED (
      SELECT r.*,
        CASE WHEN COALESCE(c.estado,g.estado)='RESUELTO' THEN COALESCE(c.modelo_id,g.modelo_id) END AS modelo_id,
        CASE COALESCE(c.estado,g.estado)
          WHEN 'RESUELTO' THEN 'RESUELTO'
          WHEN 'AMBIGUO' THEN 'AMBIGUO'
          ELSE 'NO_RESUELTO'
        END AS identity_status
      FROM rvm_scoped r
      LEFT JOIN model_aliases c ON c.context_model_norm IS NOT NULL
        AND c.valor_normalizado=r.raw_model_norm
        AND c.context_brand_norm=r.raw_brand_norm
        AND c.context_model_norm=r.raw_version_norm
      LEFT JOIN model_aliases g ON c.alias_id IS NULL
        AND g.context_model_norm IS NULL
        AND g.valor_normalizado=r.raw_model_norm
        AND g.context_brand_norm=r.raw_brand_norm
    ),
    rvm_by_vin AS (
      SELECT vin_norm,
        count(DISTINCT modelo_id) FILTER (WHERE identity_status='RESUELTO' AND modelo_id IS NOT NULL)::bigint AS distinct_model_ids,
        min(modelo_id) FILTER (WHERE identity_status='RESUELTO') AS modelo_id,
        count(*) FILTER (WHERE identity_status='AMBIGUO')::bigint AS ambiguous_rows
      FROM rvm_resolved
      GROUP BY vin_norm
    )
    SELECT s.vin_norm,
      c.canonical_modelo_id,
      r.modelo_id AS rvm_modelo_id,
      coalesce(r.distinct_model_ids,0) AS rvm_distinct_model_ids,
      coalesce(r.ambiguous_rows,0) AS rvm_ambiguous_rows,
      CASE
        WHEN c.canonical_modelo_id IS NOT NULL THEN c.canonical_modelo_id
        WHEN coalesce(r.distinct_model_ids,0)=1 AND coalesce(r.ambiguous_rows,0)=0 THEN r.modelo_id
        ELSE NULL
      END AS effective_modelo_id,
      CASE
        WHEN c.canonical_modelo_id IS NOT NULL THEN 'VEHICULO_CANONICO'
        WHEN coalesce(r.distinct_model_ids,0)=1 AND coalesce(r.ambiguous_rows,0)=0 THEN 'RVM_EXACT_VIN'
        WHEN coalesce(r.distinct_model_ids,0)>1 OR coalesce(r.ambiguous_rows,0)>0 THEN 'AMBIGUOUS_RVM_VIN'
        ELSE 'NO_EVIDENCE'
      END AS method,
      CASE
        WHEN c.canonical_modelo_id IS NOT NULL AND r.modelo_id IS NOT NULL AND c.canonical_modelo_id<>r.modelo_id THEN true
        ELSE false
      END AS canonical_rvm_conflict
    FROM source_vins s
    LEFT JOIN canonical_by_vin c USING(vin_norm)
    LEFT JOIN rvm_by_vin r USING(vin_norm)
  `);
}

export async function ventasProductVinPrecedenceAuditV01(input = {}) {
  const { startMonth, endMonth } = parseInput(input);
  const [ctx, aliases, evidenceRows] = await Promise.all([
    buildVentasContext({ cutoffMonth: endMonth }),
    loadProductIdentityMap(),
    loadVinEvidence(),
  ]);

  const sales = ctx.recognizedSales.filter((row) => row.mes_venta >= startMonth && row.mes_venta <= endMonth);
  const direct = resolveSalesProducts(sales, aliases);
  const evidenceByVin = new Map(evidenceRows.map((row) => [norm(row.vin_norm), row]));

  let directResolved = 0;
  let resolved = 0;
  let ambiguous = 0;
  let unresolved = 0;
  let resolvedByDirect = 0;
  let resolvedByCanonical = 0;
  let resolvedByRvm = 0;
  let directEvidenceConflicts = 0;
  let canonicalRvmConflicts = 0;
  const unresolvedSkus = new Map();
  const ambiguousSkus = new Map();
  const directConflictSkus = new Map();

  for (const sale of direct) {
    const directModel = sale.product_identity_status === 'RESOLVED' ? Number(sale.modelo_id) : null;
    if (directModel) directResolved += 1;

    const evidence = sale.vin ? evidenceByVin.get(norm(sale.vin)) : null;
    const canonicalModel = Number(evidence?.canonical_modelo_id) || null;
    const rvmModel = Number(evidence?.rvm_modelo_id) || null;
    const effectiveModel = Number(evidence?.effective_modelo_id) || null;

    if (evidence?.canonical_rvm_conflict) canonicalRvmConflicts += 1;
    if (directModel && ((canonicalModel && canonicalModel !== directModel)
      || (!canonicalModel && rvmModel && Number(evidence?.rvm_distinct_model_ids) === 1 && rvmModel !== directModel))) {
      directEvidenceConflicts += 1;
      const key = sale.producto_sku || '<NULL>';
      if (!directConflictSkus.has(key)) directConflictSkus.set(key, {
        sku: sale.producto_sku,
        desc_articulo: sale.producto,
        sales: 0,
        direct_modelo_id: directModel,
        canonical_modelo_id: canonicalModel,
        rvm_modelo_id: rvmModel,
      });
      directConflictSkus.get(key).sales += 1;
    }

    if (directModel) {
      resolved += 1;
      resolvedByDirect += 1;
      continue;
    }
    if (effectiveModel) {
      resolved += 1;
      if (evidence.method === 'VEHICULO_CANONICO') resolvedByCanonical += 1;
      else if (evidence.method === 'RVM_EXACT_VIN') resolvedByRvm += 1;
      continue;
    }
    if (sale.product_identity_status === 'AMBIGUOUS' || evidence?.method === 'AMBIGUOUS_RVM_VIN') {
      ambiguous += 1;
      const key = sale.producto_sku || '<NULL>';
      if (!ambiguousSkus.has(key)) ambiguousSkus.set(key, { sku: sale.producto_sku, desc_articulo: sale.producto, sales: 0 });
      ambiguousSkus.get(key).sales += 1;
      continue;
    }

    unresolved += 1;
    const key = sale.producto_sku || '<NULL>';
    if (!unresolvedSkus.has(key)) unresolvedSkus.set(key, { sku: sale.producto_sku, desc_articulo: sale.producto, sales: 0 });
    unresolvedSkus.get(key).sales += 1;
  }

  const total = sales.length;
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: resolved > directResolved ? 'ok' : 'warning',
    inputs: { start_month: startMonth, end_month: endMonth },
    policy: {
      recognition: 'ventas_context_v01 LAST-by-VIN before product resolution',
      resolution_grain: 'recognized sale',
      precedence: 'certified ventas_raw VERSION alias -> vehiculo_canonico MASTER version on exact VIN -> certified RVM MODEL identity on exact VIN',
      rvm_acceptance: 'same VIN must resolve to exactly one modelo_id and zero ambiguous RVM alias rows',
      no_fuzzy: true,
      no_substring: true,
      no_majority_vote: true,
      persistence: 'audit only; no MASTER writes',
    },
    current: {
      recognized_sales: total,
      resolved_model_sales: directResolved,
      resolved_share_pct: pct(directResolved, total),
    },
    candidate: {
      recognized_sales: total,
      resolved_model_sales: resolved,
      ambiguous_model_sales: ambiguous,
      unresolved_model_sales: unresolved,
      resolved_share_pct: pct(resolved, total),
      ambiguous_share_pct: pct(ambiguous, total),
      unresolved_share_pct: pct(unresolved, total),
      incremental_resolved_sales: resolved - directResolved,
      resolved_by_direct_alias: resolvedByDirect,
      resolved_by_vehiculo_canonico: resolvedByCanonical,
      resolved_by_rvm_exact_vin: resolvedByRvm,
    },
    conflicts: {
      direct_vs_supplemental_sales: directEvidenceConflicts,
      direct_vs_supplemental_skus: [...directConflictSkus.values()].sort((a,b) => b.sales-a.sales),
      canonical_vs_rvm_sales: canonicalRvmConflicts,
    },
    ambiguous_skus: [...ambiguousSkus.values()].sort((a,b) => b.sales-a.sales),
    top_unresolved_skus: [...unresolvedSkus.values()].sort((a,b) => b.sales-a.sales).slice(0,30),
    validation: {
      ventas_context_ok: Object.values(ctx.validation || {}).every((value) => value !== false),
      arithmetic_reconciles: resolved + ambiguous + unresolved === total,
      source_breakdown_reconciles: resolvedByDirect + resolvedByCanonical + resolvedByRvm === resolved,
      direct_alias_precedence_preserved: resolvedByDirect === directResolved,
    },
  };
}
