import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { customGptDb } from '../custom-gpt/db.js';
import { loadProductIdentityMap } from '../ventas-product/loadProductIdentityMap.js';
import { resolveSalesProducts } from '../ventas-product/resolveSaleProduct.js';

export const ENGINE_NAME = 'ventas_product_internal_model_resolution_audit_v01';
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

async function loadInternalCommercialEvidence(sql = customGptDb()) {
  return sql.query(`
    WITH note_observed AS MATERIALIZED (
      SELECT
        master_norm(modelo) AS sku_norm,
        master_norm(modelo_comercial) AS commercial_norm,
        CASE
          WHEN master_norm(desc_mae_marca) IN ('DFM','DFLM','DONG FENG','DONGFENG','ZNA DONGFENG') THEN 'DONGFENG'
          ELSE master_norm(desc_mae_marca)
        END AS brand_norm,
        trim(modelo) AS sku_raw,
        trim(modelo_comercial) AS commercial_raw
      FROM notas_venta_raw
      WHERE master_norm(modelo) IS NOT NULL
        AND master_norm(modelo_comercial) IS NOT NULL
    ),
    stable_sku AS MATERIALIZED (
      SELECT
        sku_norm,
        min(sku_raw) AS sku_raw,
        min(commercial_raw) AS commercial_raw,
        min(commercial_norm) AS commercial_norm,
        min(brand_norm) AS brand_norm,
        count(*)::bigint AS evidence_rows,
        count(DISTINCT commercial_norm)::bigint AS distinct_commercial_names,
        count(DISTINCT brand_norm)::bigint AS distinct_brands
      FROM note_observed
      GROUP BY sku_norm
    ),
    eligible AS MATERIALIZED (
      SELECT * FROM stable_sku
      WHERE distinct_commercial_names=1 AND distinct_brands=1
    ),
    exact_candidates AS MATERIALIZED (
      SELECT DISTINCT e.sku_norm,m.modelo_id,'MASTER_MODEL_NAME_EXACT'::text AS method
      FROM eligible e
      JOIN marcas_master_v01 ma ON ma.nombre_normalizado=e.brand_norm
      JOIN modelos_master_v01 m ON m.marca_id=ma.marca_id AND m.nombre_normalizado=e.commercial_norm
      UNION
      SELECT DISTINCT e.sku_norm,a.modelo_id,'RVM_MODEL_ALIAS_EXACT'::text AS method
      FROM eligible e
      JOIN producto_aliases_v01 a ON a.nivel='MODELO' AND a.fuente='rvm_raw' AND a.estado='RESUELTO'
        AND a.valor_normalizado=e.commercial_norm AND a.modelo_id IS NOT NULL
      JOIN modelos_master_v01 m ON m.modelo_id=a.modelo_id
      JOIN marcas_master_v01 ma ON ma.marca_id=m.marca_id AND ma.nombre_normalizado=e.brand_norm
    ),
    candidate_counts AS (
      SELECT sku_norm,count(DISTINCT modelo_id)::bigint AS distinct_model_ids,min(modelo_id) AS modelo_id
      FROM exact_candidates
      GROUP BY sku_norm
    ),
    distributions AS (
      SELECT c.sku_norm,
        jsonb_agg(jsonb_build_object(
          'modelo_id',c.modelo_id,
          'marca',ma.nombre_canonico,
          'modelo',m.nombre_canonico,
          'methods',c.methods
        ) ORDER BY c.modelo_id) AS model_distribution
      FROM (
        SELECT sku_norm,modelo_id,array_agg(DISTINCT method ORDER BY method) AS methods
        FROM exact_candidates GROUP BY sku_norm,modelo_id
      ) c
      JOIN modelos_master_v01 m ON m.modelo_id=c.modelo_id
      JOIN marcas_master_v01 ma ON ma.marca_id=m.marca_id
      GROUP BY c.sku_norm
    )
    SELECT
      s.sku_norm,s.sku_raw,s.commercial_raw,s.commercial_norm,s.brand_norm,s.evidence_rows,
      s.distinct_commercial_names,s.distinct_brands,
      coalesce(c.distinct_model_ids,0) AS distinct_model_ids,c.modelo_id,
      coalesce(d.model_distribution,'[]'::jsonb) AS model_distribution
    FROM stable_sku s
    LEFT JOIN candidate_counts c USING(sku_norm)
    LEFT JOIN distributions d USING(sku_norm)
    ORDER BY s.sku_norm
  `);
}

function candidateStatus(row) {
  if (!row || Number(row.distinct_commercial_names) !== 1 || Number(row.distinct_brands) !== 1) return 'AMBIGUOUS';
  const n = Number(row.distinct_model_ids || 0);
  if (n > 1) return 'AMBIGUOUS';
  if (n === 1 && Number(row.modelo_id) > 0) return 'RESOLVED';
  return 'UNRESOLVED';
}

function pct(n,d) { return d ? Math.round((10000*n)/d)/100 : null; }

export async function ventasProductInternalModelResolutionAuditV01(input = {}) {
  const { startMonth,endMonth } = parseInput(input);
  const [ventasContext,directAliases,evidenceRows] = await Promise.all([
    buildVentasContext({ cutoffMonth:endMonth }),
    loadProductIdentityMap(),
    loadInternalCommercialEvidence(),
  ]);
  const periodSales = ventasContext.recognizedSales.filter((r) => r.mes_venta >= startMonth && r.mes_venta <= endMonth);
  const direct = resolveSalesProducts(periodSales,directAliases);
  const evidenceBySku = new Map(evidenceRows.map((r) => [norm(r.sku_norm), { ...r, candidate_status:candidateStatus(r) }]));

  let directResolved=0,resolved=0,ambiguous=0,unresolved=0,directConflicts=0;
  const conflictSkus=new Map(), unresolvedSkus=new Map(), ambiguousSkus=new Map();
  for (const sale of direct) {
    const directModel = sale.product_identity_status==='RESOLVED' ? Number(sale.modelo_id) : null;
    if (directModel) directResolved += 1;
    const e=evidenceBySku.get(norm(sale.producto_sku));
    const candidate=e?.candidate_status || 'UNRESOLVED';
    const internalModel=candidate==='RESOLVED' ? Number(e.modelo_id) : null;
    if (directModel && internalModel && directModel!==internalModel) {
      directConflicts += 1;
      conflictSkus.set(norm(sale.producto_sku),{sku:sale.producto_sku,desc_articulo:sale.producto,direct_modelo_id:directModel,internal_modelo_id:internalModel,commercial_name:e?.commercial_raw,model_distribution:e?.model_distribution||[]});
    }
    if (directModel) resolved += 1;
    else if (internalModel) resolved += 1;
    else if (candidate==='AMBIGUOUS' || sale.product_identity_status==='AMBIGUOUS') {
      ambiguous += 1;
      const key=norm(sale.producto_sku)||'<NULL>';
      if (!ambiguousSkus.has(key)) ambiguousSkus.set(key,{sku:sale.producto_sku,desc_articulo:sale.producto,sales:0,commercial_name:e?.commercial_raw||null,model_distribution:e?.model_distribution||[]});
      ambiguousSkus.get(key).sales += 1;
    } else {
      unresolved += 1;
      const key=norm(sale.producto_sku)||'<NULL>';
      if (!unresolvedSkus.has(key)) unresolvedSkus.set(key,{sku:sale.producto_sku,desc_articulo:sale.producto,sales:0,commercial_name:e?.commercial_raw||null});
      unresolvedSkus.get(key).sales += 1;
    }
  }

  const skuStats=evidenceRows.reduce((a,r)=>{ const s=candidateStatus(r); a.total+=1; a[s]+=1; return a; },{total:0,RESOLVED:0,AMBIGUOUS:0,UNRESOLVED:0});
  const total=periodSales.length;
  return {
    engine:ENGINE_NAME,version:ENGINE_VERSION,status: directConflicts===0 && resolved>directResolved ? 'ok':'warning',
    inputs:{start_month:startMonth,end_month:endMonth},
    policy:{
      recognition:'ventas_context_v01 LAST-by-VIN before product resolution',
      candidate_rule:'ventas_raw articulo == notas_venta_raw modelo technical SKU; require one stable modelo_comercial + brand per SKU, then exact normalized match only to MASTER model name or certified RVM model alias within canonical brand',
      precedence:'existing certified ventas_raw VERSION alias remains authoritative; internal exact model mapping only fills unresolved sales',
      no_fuzzy:true,no_substring:true,no_majority_vote:true,persistence:'audit only; no MASTER writes'
    },
    current:{recognized_sales:total,resolved_model_sales:directResolved,resolved_share_pct:pct(directResolved,total)},
    candidate:{recognized_sales:total,resolved_model_sales:resolved,ambiguous_model_sales:ambiguous,unresolved_model_sales:unresolved,resolved_share_pct:pct(resolved,total),ambiguous_share_pct:pct(ambiguous,total),unresolved_share_pct:pct(unresolved,total),incremental_resolved_sales:resolved-directResolved},
    sku_evidence:{total_skus:skuStats.total,candidate_resolved_skus:skuStats.RESOLVED,candidate_ambiguous_skus:skuStats.AMBIGUOUS,candidate_unresolved_skus:skuStats.UNRESOLVED,direct_conflict_sales:directConflicts,direct_conflict_skus:[...conflictSkus.values()]},
    ambiguous_skus:[...ambiguousSkus.values()].sort((a,b)=>b.sales-a.sales),
    top_unresolved_skus:[...unresolvedSkus.values()].sort((a,b)=>b.sales-a.sales).slice(0,30),
    validation:{ventas_context_ok:Object.values(ventasContext.validation||{}).every((v)=>v!==false),arithmetic_reconciles:resolved+ambiguous+unresolved===total,stable_source_sku_contract:evidenceRows.every((r)=>Number(r.distinct_commercial_names)===1 && Number(r.distinct_brands)===1),direct_conflicts_explicit:directConflicts===[...direct].filter((sale)=>{const d=sale.product_identity_status==='RESOLVED'?Number(sale.modelo_id):null;const e=evidenceBySku.get(norm(sale.producto_sku));return d&&e?.candidate_status==='RESOLVED'&&d!==Number(e.modelo_id);}).length}
  };
}
