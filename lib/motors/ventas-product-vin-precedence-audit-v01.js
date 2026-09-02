import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { customGptDb } from '../custom-gpt/db.js';
import { loadProductIdentityMap } from '../ventas-product/loadProductIdentityMap.js';
import { resolveSalesProducts } from '../ventas-product/resolveSaleProduct.js';

export const ENGINE_NAME='ventas_product_vin_precedence_audit_v01';
export const ENGINE_VERSION='0.1';
const MONTH_RE=/^\d{4}-(0[1-9]|1[0-2])$/;

function norm(value){if(value==null)return null;const t=String(value).normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().replace(/\s+/g,' ').toUpperCase();return t||null;}
function parseInput(input={}){const startMonth=String(input.start_month||''),endMonth=String(input.end_month||'');if(!MONTH_RE.test(startMonth)||!MONTH_RE.test(endMonth))throw new Error('start_month and end_month must use YYYY-MM');if(startMonth>endMonth)throw new Error('start_month must be <= end_month');return{startMonth,endMonth};}
function pct(n,d){return d?Math.round(10000*n/d)/100:null;}

async function loadEvidence(sql=customGptDb()){
  return sql.query(`
    WITH source_skus AS MATERIALIZED (
      SELECT DISTINCT master_norm(articulo) sku_norm, upper(trim(nro_vin_chasis)) vin_norm
      FROM ventas_raw
      WHERE master_norm(articulo) IS NOT NULL AND nullif(trim(nro_vin_chasis),'') IS NOT NULL
    ), source_values AS MATERIALIZED (
      SELECT master_norm(articulo) sku_norm,min(trim(articulo)) sku_raw,min(trim(desc_articulo)) desc_articulo,
             min(trim(desc_mae_marca)) desc_mae_marca,count(*)::bigint raw_rows
      FROM ventas_raw WHERE master_norm(articulo) IS NOT NULL GROUP BY master_norm(articulo)
    ), canonical_by_vin AS MATERIALIZED (
      SELECT s.sku_norm,s.vin_norm,v.modelo_id canonical_modelo_id
      FROM source_skus s
      JOIN vehiculo_canonico vc ON upper(trim(vc.vin))=s.vin_norm
      JOIN versiones_master_v01 v ON v.version_id=vc.version_id
      WHERE vc.version_id IS NOT NULL
    ), model_aliases_ranked AS MATERIALIZED (
      SELECT a.*,master_norm(a.contexto_marca_raw) context_brand_norm,master_norm(a.contexto_modelo_raw) context_model_norm,
        row_number() OVER(PARTITION BY a.valor_normalizado,master_norm(a.contexto_marca_raw),master_norm(a.contexto_modelo_raw)
          ORDER BY CASE a.estado WHEN 'RESUELTO' THEN 1 WHEN 'AMBIGUO' THEN 2 ELSE 3 END,a.alias_id) rn
      FROM producto_aliases_v01 a WHERE a.nivel='MODELO' AND a.fuente='rvm_raw'
    ), model_aliases AS MATERIALIZED (SELECT * FROM model_aliases_ranked WHERE rn=1),
    rvm_scoped AS MATERIALIZED (
      SELECT s.sku_norm,s.vin_norm,master_norm(r.marca) raw_brand_norm,master_norm(r.modelo_homologado) raw_model_norm,master_norm(r.modeo_version) raw_version_norm
      FROM source_skus s JOIN rvm_raw r ON upper(trim(r.vin))=s.vin_norm
    ), rvm_resolved AS MATERIALIZED (
      SELECT r.*,
        CASE WHEN COALESCE(c.estado,g.estado)='RESUELTO' THEN COALESCE(c.modelo_id,g.modelo_id) END modelo_id,
        CASE COALESCE(c.estado,g.estado) WHEN 'RESUELTO' THEN 'RESUELTO' WHEN 'AMBIGUO' THEN 'AMBIGUO' ELSE 'NO_RESUELTO' END identity_status
      FROM rvm_scoped r
      LEFT JOIN model_aliases c ON c.context_model_norm IS NOT NULL AND c.valor_normalizado=r.raw_model_norm AND c.context_brand_norm=r.raw_brand_norm AND c.context_model_norm=r.raw_version_norm
      LEFT JOIN model_aliases g ON c.alias_id IS NULL AND g.context_model_norm IS NULL AND g.valor_normalizado=r.raw_model_norm AND g.context_brand_norm=r.raw_brand_norm
    ), rvm_by_vin AS (
      SELECT sku_norm,vin_norm,
        count(DISTINCT modelo_id) FILTER(WHERE identity_status='RESUELTO' AND modelo_id IS NOT NULL)::bigint distinct_models,
        min(modelo_id) FILTER(WHERE identity_status='RESUELTO') modelo_id,
        count(*) FILTER(WHERE identity_status='AMBIGUO')::bigint ambiguous_rows
      FROM rvm_resolved GROUP BY sku_norm,vin_norm
    ), effective_vin AS MATERIALIZED (
      SELECT s.sku_norm,s.vin_norm,
        CASE WHEN c.canonical_modelo_id IS NOT NULL THEN c.canonical_modelo_id
             WHEN coalesce(r.distinct_models,0)=1 AND coalesce(r.ambiguous_rows,0)=0 THEN r.modelo_id END modelo_id,
        CASE WHEN c.canonical_modelo_id IS NOT NULL THEN 'VEHICULO_CANONICO'
             WHEN coalesce(r.distinct_models,0)=1 AND coalesce(r.ambiguous_rows,0)=0 THEN 'RVM_EXACT_VIN'
             WHEN coalesce(r.distinct_models,0)>1 OR coalesce(r.ambiguous_rows,0)>0 THEN 'AMBIGUOUS_RVM_VIN'
             ELSE 'NO_EVIDENCE' END method,
        r.modelo_id rvm_modelo_id,c.canonical_modelo_id
      FROM source_skus s
      LEFT JOIN canonical_by_vin c USING(sku_norm,vin_norm)
      LEFT JOIN rvm_by_vin r USING(sku_norm,vin_norm)
    ), per_sku AS (
      SELECT sku_norm,
        count(DISTINCT modelo_id) FILTER(WHERE modelo_id IS NOT NULL)::bigint distinct_model_ids,
        min(modelo_id) FILTER(WHERE modelo_id IS NOT NULL) modelo_id,
        count(*) FILTER(WHERE method='VEHICULO_CANONICO')::bigint canonical_vins,
        count(*) FILTER(WHERE method='RVM_EXACT_VIN')::bigint rvm_vins,
        count(*) FILTER(WHERE method='AMBIGUOUS_RVM_VIN')::bigint ambiguous_vins,
        count(*) FILTER(WHERE canonical_modelo_id IS NOT NULL AND rvm_modelo_id IS NOT NULL AND canonical_modelo_id<>rvm_modelo_id)::bigint canonical_rvm_conflict_vins
      FROM effective_vin GROUP BY sku_norm
    ), model_counts AS (
      SELECT e.sku_norm,e.modelo_id,count(*)::bigint vins
      FROM effective_vin e WHERE e.modelo_id IS NOT NULL GROUP BY e.sku_norm,e.modelo_id
    ), dist AS (
      SELECT mc.sku_norm,jsonb_agg(jsonb_build_object('modelo_id',mc.modelo_id,'marca',ma.nombre_canonico,'modelo',m.nombre_canonico,'vins',mc.vins) ORDER BY mc.vins DESC,mc.modelo_id) model_distribution
      FROM model_counts mc JOIN modelos_master_v01 m ON m.modelo_id=mc.modelo_id JOIN marcas_master_v01 ma ON ma.marca_id=m.marca_id GROUP BY mc.sku_norm
    )
    SELECT s.*,coalesce(p.distinct_model_ids,0) distinct_model_ids,p.modelo_id,
      coalesce(p.canonical_vins,0) canonical_vins,coalesce(p.rvm_vins,0) rvm_vins,coalesce(p.ambiguous_vins,0) ambiguous_vins,
      coalesce(p.canonical_rvm_conflict_vins,0) canonical_rvm_conflict_vins,coalesce(d.model_distribution,'[]'::jsonb) model_distribution
    FROM source_values s LEFT JOIN per_sku p USING(sku_norm) LEFT JOIN dist d USING(sku_norm) ORDER BY s.sku_norm
  `);
}

function status(r){if(!r)return'UNRESOLVED';if(Number(r.ambiguous_vins||0)>0||Number(r.distinct_model_ids||0)>1)return'AMBIGUOUS';if(Number(r.distinct_model_ids||0)===1&&Number(r.modelo_id)>0)return'RESOLVED';return'UNRESOLVED';}

export async function ventasProductVinPrecedenceAuditV01(input={}){
  const{startMonth,endMonth}=parseInput(input);
  const[ctx,aliases,evidenceRows]=await Promise.all([buildVentasContext({cutoffMonth:endMonth}),loadProductIdentityMap(),loadEvidence()]);
  const sales=ctx.recognizedSales.filter(r=>r.mes_venta>=startMonth&&r.mes_venta<=endMonth);
  const direct=resolveSalesProducts(sales,aliases), map=new Map(evidenceRows.map(r=>[norm(r.sku_norm),{...r,candidate_status:status(r)}]));
  let directResolved=0,resolved=0,ambiguous=0,unresolved=0;const amb=new Map(),unres=new Map();
  for(const sale of direct){const dm=sale.product_identity_status==='RESOLVED'?Number(sale.modelo_id):null;if(dm)directResolved++;const e=map.get(norm(sale.producto_sku));const cm=e?.candidate_status==='RESOLVED'?Number(e.modelo_id):null;if(dm||cm)resolved++;else if(e?.candidate_status==='AMBIGUOUS'||sale.product_identity_status==='AMBIGUOUS'){ambiguous++;const k=norm(sale.producto_sku)||'<NULL>';if(!amb.has(k))amb.set(k,{sku:sale.producto_sku,desc_articulo:sale.producto,sales:0,canonical_vins:Number(e?.canonical_vins||0),rvm_vins:Number(e?.rvm_vins||0),ambiguous_vins:Number(e?.ambiguous_vins||0),canonical_rvm_conflict_vins:Number(e?.canonical_rvm_conflict_vins||0),model_distribution:e?.model_distribution||[]});amb.get(k).sales++;}else{unresolved++;const k=norm(sale.producto_sku)||'<NULL>';if(!unres.has(k))unres.set(k,{sku:sale.producto_sku,desc_articulo:sale.producto,sales:0});unres.get(k).sales++;}}
  const sku=evidenceRows.reduce((a,r)=>{a.total++;a[status(r)]++;a.canonical_rvm_conflict_vins+=Number(r.canonical_rvm_conflict_vins||0);return a;},{total:0,RESOLVED:0,AMBIGUOUS:0,UNRESOLVED:0,canonical_rvm_conflict_vins:0});
  const total=sales.length;
  return{engine:ENGINE_NAME,version:ENGINE_VERSION,status:resolved>directResolved?'ok':'warning',inputs:{start_month:startMonth,end_month:endMonth},policy:{recognition:'ventas_context_v01 LAST-by-VIN before product resolution',candidate_rule:'per exact VIN use vehiculo_canonico MASTER model when version_id exists; otherwise use certified RVM MODEL identity on the same VIN; accept SKU only when effective VIN evidence converges to one modelo_id and no VIN remains RVM-ambiguous',precedence:'existing certified ventas_raw VERSION alias remains authoritative for already-resolved sales',no_fuzzy:true,no_substring:true,no_majority_vote:true,persistence:'audit only; no MASTER writes'},current:{recognized_sales:total,resolved_model_sales:directResolved,resolved_share_pct:pct(directResolved,total)},candidate:{recognized_sales:total,resolved_model_sales:resolved,ambiguous_model_sales:ambiguous,unresolved_model_sales:unresolved,resolved_share_pct:pct(resolved,total),ambiguous_share_pct:pct(ambiguous,total),unresolved_share_pct:pct(unresolved,total),incremental_resolved_sales:resolved-directResolved},sku_evidence:{total_skus:sku.total,candidate_resolved_skus:sku.RESOLVED,candidate_ambiguous_skus:sku.AMBIGUOUS,candidate_unresolved_skus:sku.UNRESOLVED,canonical_rvm_conflict_vins:sku.canonical_rvm_conflict_vins},ambiguous_skus:[...amb.values()].sort((a,b)=>b.sales-a.sales),top_unresolved_skus:[...unres.values()].sort((a,b)=>b.sales-a.sales).slice(0,30),validation:{ventas_context_ok:Object.values(ctx.validation||{}).every(v=>v!==false),arithmetic_reconciles:resolved+ambiguous+unresolved===total,ambiguities_explicit:true}};
}
