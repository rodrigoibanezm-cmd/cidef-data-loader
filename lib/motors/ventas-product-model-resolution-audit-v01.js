import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { customGptDb } from '../custom-gpt/db.js';
import { loadProductIdentityMap } from '../ventas-product/loadProductIdentityMap.js';
import { resolveSalesProducts } from '../ventas-product/resolveSaleProduct.js';

export const ENGINE_NAME = 'ventas_product_model_resolution_audit_v01';
export const ENGINE_VERSION = '0.1';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function norm(value) {
  if (value == null) return null;
  const text = String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toUpperCase();
  return text || null;
}

function parseInput(input = {}) {
  const startMonth = String(input.start_month || '');
  const endMonth = String(input.end_month || '');
  if (!MONTH_RE.test(startMonth) || !MONTH_RE.test(endMonth)) throw new Error('start_month and end_month must use YYYY-MM');
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  return { startMonth, endMonth };
}

async function loadSkuModelEvidence(sql = customGptDb()) {
  return sql.query(`
    WITH source_skus AS MATERIALIZED (
      SELECT DISTINCT
        master_norm(v.articulo) AS sku_norm,
        upper(trim(v.nro_vin_chasis)) AS vin_norm
      FROM ventas_raw v
      WHERE master_norm(v.articulo) IS NOT NULL
        AND nullif(trim(v.nro_vin_chasis),'') IS NOT NULL
    ),
    source_values AS MATERIALIZED (
      SELECT
        master_norm(articulo) AS sku_norm,
        min(trim(articulo)) AS sku_raw,
        min(trim(desc_articulo)) AS desc_articulo,
        min(trim(desc_mae_marca)) AS desc_mae_marca,
        count(*)::bigint AS raw_rows
      FROM ventas_raw
      WHERE master_norm(articulo) IS NOT NULL
      GROUP BY master_norm(articulo)
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
      SELECT
        s.sku_norm,
        s.vin_norm,
        master_norm(r.marca) AS raw_brand_norm,
        master_norm(r.modelo_homologado) AS raw_model_norm,
        master_norm(r.modeo_version) AS raw_version_norm
      FROM source_skus s
      JOIN rvm_raw r ON upper(trim(r.vin))=s.vin_norm
    ),
    identity_resolution AS MATERIALIZED (
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
    model_counts AS (
      SELECT sku_norm,modelo_id,count(*)::bigint evidence_rows,count(DISTINCT vin_norm)::bigint vins
      FROM identity_resolution
      WHERE identity_status='RESUELTO' AND modelo_id IS NOT NULL
      GROUP BY sku_norm,modelo_id
    ),
    model_distribution AS (
      SELECT mc.sku_norm,
        jsonb_agg(jsonb_build_object(
          'modelo_id',mc.modelo_id,
          'marca',ma.nombre_canonico,
          'modelo',mo.nombre_canonico,
          'evidence_rows',mc.evidence_rows,
          'vins',mc.vins
        ) ORDER BY mc.evidence_rows DESC,mc.modelo_id) AS model_distribution
      FROM model_counts mc
      JOIN modelos_master_v01 mo ON mo.modelo_id=mc.modelo_id
      JOIN marcas_master_v01 ma ON ma.marca_id=mo.marca_id
      GROUP BY mc.sku_norm
    ),
    per_sku AS (
      SELECT
        sku_norm,
        count(DISTINCT vin_norm)::bigint AS rvm_linked_vins,
        count(DISTINCT modelo_id) FILTER (WHERE identity_status='RESUELTO' AND modelo_id IS NOT NULL)::bigint AS distinct_model_ids,
        min(modelo_id) FILTER (WHERE identity_status='RESUELTO') AS modelo_id,
        count(*) FILTER (WHERE identity_status='RESUELTO')::bigint AS resolved_evidence_rows,
        count(*) FILTER (WHERE identity_status='AMBIGUO')::bigint AS ambiguous_evidence_rows,
        count(*) FILTER (WHERE identity_status='NO_RESUELTO')::bigint AS unresolved_evidence_rows
      FROM identity_resolution
      GROUP BY sku_norm
    )
    SELECT
      s.sku_norm,s.sku_raw,s.desc_articulo,s.desc_mae_marca,s.raw_rows,
      coalesce(p.rvm_linked_vins,0) AS rvm_linked_vins,
      coalesce(p.distinct_model_ids,0) AS distinct_model_ids,
      p.modelo_id,
      coalesce(p.resolved_evidence_rows,0) AS resolved_evidence_rows,
      coalesce(p.ambiguous_evidence_rows,0) AS ambiguous_evidence_rows,
      coalesce(p.unresolved_evidence_rows,0) AS unresolved_evidence_rows,
      coalesce(d.model_distribution,'[]'::jsonb) AS model_distribution,
      mo.nombre_canonico AS modelo,
      ma.nombre_canonico AS marca
    FROM source_values s
    LEFT JOIN per_sku p USING(sku_norm)
    LEFT JOIN model_distribution d USING(sku_norm)
    LEFT JOIN modelos_master_v01 mo ON mo.modelo_id=p.modelo_id
    LEFT JOIN marcas_master_v01 ma ON ma.marca_id=mo.marca_id
    ORDER BY s.sku_norm
  `);
}

function candidateStatus(row) {
  const distinctModels = Number(row?.distinct_model_ids || 0);
  const ambiguousEvidence = Number(row?.ambiguous_evidence_rows || 0);
  if (distinctModels > 1 || ambiguousEvidence > 0) return 'AMBIGUOUS';
  if (distinctModels === 1 && Number(row?.modelo_id) > 0) return 'RESOLVED';
  return 'UNRESOLVED';
}

function pct(n, d) {
  return d ? Math.round((10000 * n) / d) / 100 : null;
}

export async function ventasProductModelResolutionAuditV01(input = {}) {
  const { startMonth, endMonth } = parseInput(input);
  const [ventasContext, directAliases, evidenceRows] = await Promise.all([
    buildVentasContext({ cutoffMonth: endMonth }),
    loadProductIdentityMap(),
    loadSkuModelEvidence(),
  ]);

  const periodSales = ventasContext.recognizedSales.filter((row) => row.mes_venta >= startMonth && row.mes_venta <= endMonth);
  const direct = resolveSalesProducts(periodSales, directAliases);
  const evidenceBySku = new Map();
  for (const row of evidenceRows) {
    const value = { ...row, candidate_status: candidateStatus(row) };
    for (const key of [norm(row.sku_norm), norm(row.sku_raw)].filter(Boolean)) evidenceBySku.set(key, value);
  }

  let resolved = 0;
  let ambiguous = 0;
  let unresolved = 0;
  let directResolved = 0;
  let crossMethodConflicts = 0;
  const unresolvedCounts = new Map();
  const crossMethodConflictSkus = new Map();

  for (const sale of direct) {
    if (sale.product_identity_status === 'RESOLVED') directResolved += 1;
    const evidence = evidenceBySku.get(norm(sale.producto_sku));
    const candidate = evidence?.candidate_status || 'UNRESOLVED';
    const candidateModel = candidate === 'RESOLVED' ? Number(evidence.modelo_id) : null;
    const directModel = sale.product_identity_status === 'RESOLVED' ? Number(sale.modelo_id) : null;

    if (directModel && candidateModel && directModel !== candidateModel) {
      crossMethodConflicts += 1;
      ambiguous += 1;
      crossMethodConflictSkus.set(norm(sale.producto_sku), {
        sku: sale.producto_sku,
        desc_articulo: sale.producto,
        direct_modelo_id: directModel,
        rvm_modelo_id: candidateModel,
        rvm_model_distribution: evidence?.model_distribution || [],
      });
    } else if (directModel || candidateModel) {
      resolved += 1;
    } else if (candidate === 'AMBIGUOUS' || sale.product_identity_status === 'AMBIGUOUS') {
      ambiguous += 1;
    } else {
      unresolved += 1;
      const key = norm(sale.producto_sku) || '<NULL>';
      if (!unresolvedCounts.has(key)) unresolvedCounts.set(key, { sku: sale.producto_sku, desc_articulo: sale.producto, sales: 0 });
      unresolvedCounts.get(key).sales += 1;
    }
  }

  const skuStats = evidenceRows.reduce((acc, row) => {
    const status = candidateStatus(row);
    acc.total += 1;
    acc[status] += 1;
    if (Number(row.rvm_linked_vins || 0) > 0) acc.with_rvm_vin_evidence += 1;
    return acc;
  }, { total: 0, RESOLVED: 0, AMBIGUOUS: 0, UNRESOLVED: 0, with_rvm_vin_evidence: 0 });

  const candidateAmbiguousSkus = evidenceRows
    .filter((row) => candidateStatus(row) === 'AMBIGUOUS')
    .map((row) => ({
      sku: row.sku_raw,
      desc_articulo: row.desc_articulo,
      desc_mae_marca: row.desc_mae_marca,
      raw_rows: Number(row.raw_rows || 0),
      rvm_linked_vins: Number(row.rvm_linked_vins || 0),
      distinct_model_ids: Number(row.distinct_model_ids || 0),
      ambiguous_evidence_rows: Number(row.ambiguous_evidence_rows || 0),
      model_distribution: row.model_distribution || [],
    }))
    .sort((a,b) => b.raw_rows-a.raw_rows || String(a.sku).localeCompare(String(b.sku)));

  const total = periodSales.length;
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: crossMethodConflicts === 0 && resolved > directResolved ? 'ok' : 'warning',
    inputs: { start_month: startMonth, end_month: endMonth },
    policy: {
      recognition: 'ventas_context_v01 LAST-by-VIN before product resolution',
      candidate_rule: 'ventas_raw articulo -> exact VIN -> rvm_raw VIN -> certified RVM MODEL alias; accept SKU only when all resolved exact-VIN evidence converges to one modelo_id and no ambiguous RVM evidence exists',
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
    },
    sku_evidence: {
      total_skus: skuStats.total,
      skus_with_rvm_vin_evidence: skuStats.with_rvm_vin_evidence,
      candidate_resolved_skus: skuStats.RESOLVED,
      candidate_ambiguous_skus: skuStats.AMBIGUOUS,
      candidate_unresolved_skus: skuStats.UNRESOLVED,
      cross_method_conflict_sales: crossMethodConflicts,
      cross_method_conflict_skus: [...crossMethodConflictSkus.values()],
      ambiguous_sku_detail: candidateAmbiguousSkus,
    },
    top_unresolved_skus: [...unresolvedCounts.values()].sort((a,b) => b.sales-a.sales || String(a.sku).localeCompare(String(b.sku))).slice(0,30),
    validation: {
      ventas_context_ok: Object.values(ventasContext.validation || {}).every((value) => value !== false),
      arithmetic_reconciles: resolved + ambiguous + unresolved === total,
      no_cross_method_conflicts: crossMethodConflicts === 0,
      candidate_ambiguities_explicit: candidateAmbiguousSkus.length === skuStats.AMBIGUOUS,
    },
  };
}
