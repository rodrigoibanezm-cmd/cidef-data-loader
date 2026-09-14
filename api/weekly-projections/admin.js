import { buildVentasUniverse } from '../../lib/ventas-universe/buildVentasUniverse.js';
import { getDb, handleApiError, parsePositiveBigInt, parseWeekStart } from '../../lib/weekly-projections/db.js';

function buildSalesMtd(universe, targetMonth, cutoffDate) {
  const salesFrom = `${targetMonth}-02`;
  const events = (universe?.analytical_events || []).filter((event) => {
    if (event.canonical_commercial_universe !== 'OWN_STORES') return false;
    if (event.mes_venta !== targetMonth) return false;
    const date = String(event.fecha_venta_iso || '').slice(0, 10);
    return date >= salesFrom && date <= cutoffDate;
  });
  const grouped = new Map();
  for (const event of events) {
    const storeId = event.certified_store_id == null ? null : String(event.certified_store_id);
    const brand = event.marca_nombre || 'Sin marca';
    const key = `${storeId ?? 'null'}|${brand}`;
    if (!grouped.has(key)) grouped.set(key, { sucursal_id: storeId, sucursal: event.certified_store_name || 'Sin tienda', marca: brand, units: 0 });
    grouped.get(key).units += 1;
  }
  const details = events.map((event) => ({
    vin: event.vin ?? null,
    fecha_venta: String(event.fecha_venta_iso || '').slice(0, 10) || null,
    sucursal_id: event.certified_store_id == null ? null : String(event.certified_store_id),
    sucursal: event.certified_store_name || 'Sin tienda',
    vendedor: event.vendedor || null,
    marca: event.marca_nombre || 'Sin marca',
    modelo: event.modelo_nombre || event.producto || 'Sin modelo',
    factura: event.nro_factura || event.factura || null,
  })).sort((a,b)=>String(a.sucursal).localeCompare(String(b.sucursal))||String(a.fecha_venta).localeCompare(String(b.fecha_venta))||String(a.vin).localeCompare(String(b.vin)));
  return { month: targetMonth, date_from: salesFrom, date_to: cutoffDate, cutoff_date: cutoffDate, total_units: events.length, rows: [...grouped.values()].sort((a,b)=>String(a.sucursal).localeCompare(String(b.sucursal))||String(a.marca).localeCompare(String(b.marca))), details, universe: universe?.universe ?? null, universe_version: universe?.version ?? null, commercial_universe: universe?.commercial_universe ?? null, validation: universe?.validation ?? null };
}

function filterSalesByStore(sales, sucursalId) {
  if (!sucursalId) return sales;
  const id = String(sucursalId);
  const rows = (sales.rows || []).filter((row) => String(row.sucursal_id) === id);
  const details = (sales.details || []).filter((row) => String(row.sucursal_id) === id);
  return { ...sales, rows, details, total_units: details.length };
}

function byStoreSales(sales) {
  const map = new Map();
  for (const row of sales?.rows || []) {
    const key = row.sucursal_id ?? `name:${row.sucursal}`;
    const current = map.get(key) || { sucursal_id: row.sucursal_id, sucursal: row.sucursal, units: 0 };
    current.units += Number(row.units || 0); map.set(key, current);
  }
  return map;
}
function byStoreProjection(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = row.sucursal_id ?? `name:${row.sucursal}`;
    const current = map.get(key) || { sucursal_id: row.sucursal_id, sucursal: row.sucursal, units: 0 };
    current.units += Number(row.projected_units || 0); map.set(key, current);
  }
  return map;
}
const ratio = (n,d) => d ? n/d : null;
function buildEvolution(previousCut, currentCut, previousProjectionRows, previousSales, currentSales) {
  if (!previousCut) return null;
  const previousProjection = previousProjectionRows.reduce((s,r)=>s+Number(r.projected_units||0),0);
  const previousSold = Number(previousSales.total_units || 0), currentSold = Number(currentSales.total_units || 0);
  const expected = previousSold + previousProjection, newSales = currentSold - previousSold;
  const pm=byStoreProjection(previousProjectionRows), ps=byStoreSales(previousSales), cs=byStoreSales(currentSales);
  const keys=new Set([...pm.keys(),...ps.keys(),...cs.keys()]);
  const stores=[...keys].map((key)=>{
    const p=pm.get(key), a=ps.get(key), c=cs.get(key);
    const prev=Number(a?.units||0), proj=Number(p?.units||0), cur=Number(c?.units||0), exp=prev+proj, inc=cur-prev;
    return { sucursal_id:c?.sucursal_id??a?.sucursal_id??p?.sucursal_id??null, sucursal:c?.sucursal||a?.sucursal||p?.sucursal||'Sin tienda', previous_sales_mtd:prev, previous_projection:proj, expected_current:exp, current_sales_mtd:cur, new_sales:inc, projection_fulfillment:ratio(inc,proj), expected_fulfillment:ratio(cur,exp) };
  }).sort((a,b)=>a.sucursal.localeCompare(b.sucursal));
  return { previous_cut:previousCut, current_cut:currentCut, previous_sales_mtd:previousSold, previous_projection:previousProjection, expected_current:expected, current_sales_mtd:currentSold, new_sales:newSales, projection_fulfillment:ratio(newSales,previousProjection), expected_fulfillment:ratio(currentSold,expected), stores };
}

function dateParts(value) {
  const [year, month, day] = String(value).slice(0,10).split('-').map(Number);
  return { year, month, day };
}
function monthShiftSameDay(value, offsetMonths) {
  const { year, month, day } = dateParts(value);
  const first = new Date(Date.UTC(year, month - 1 + offsetMonths, 1));
  const y = first.getUTCFullYear(), m = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function minusDays(value, days) {
  const { year, month, day } = dateParts(value);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function periodSnapshot(universe, cutoffDate, sucursalId, label) {
  const month = cutoffDate.slice(0,7), salesFrom = `${month}-02`, weekFrom = minusDays(cutoffDate, 6), id = sucursalId ? String(sucursalId) : null;
  const events = (universe?.analytical_events || []).filter((event) => {
    if (event.canonical_commercial_universe !== 'OWN_STORES') return false;
    if (id && String(event.certified_store_id) !== id) return false;
    return true;
  });
  const dated = events.map((event) => ({ event, date:String(event.fecha_venta_iso||'').slice(0,10) }));
  const mtd = dated.filter(({event,date}) => event.mes_venta === month && date >= salesFrom && date <= cutoffDate).length;
  const last7 = dated.filter(({date}) => date >= weekFrom && date <= cutoffDate).length;
  return { label, month, cutoff_date:cutoffDate, effective_cutoff_date:universe?.period?.cutoff_date ?? cutoffDate, mtd_units:mtd, last_7d_units:last7 };
}

async function buildHistoricalContext(currentUniverse, weekStart, sucursalId) {
  const refs = [
    { label:'CURRENT', date:weekStart, universe:currentUniverse },
    { label:'M-1', date:monthShiftSameDay(weekStart,-1) },
    { label:'M-2', date:monthShiftSameDay(weekStart,-2) },
    { label:'M-3', date:monthShiftSameDay(weekStart,-3) },
    { label:'YOY', date:monthShiftSameDay(weekStart,-12) },
  ];
  const historical = refs.slice(1);
  const universes = await Promise.all(historical.map((ref)=>buildVentasUniverse({ commercial_universe:'OWN_STORES', cutoff_date:ref.date })));
  historical.forEach((ref,index)=>{ref.universe=universes[index];});
  const periods = refs.map((ref)=>periodSnapshot(ref.universe,ref.date,sucursalId,ref.label));
  const current=periods[0], yoy=periods.find((p)=>p.label==='YOY');
  return {
    periods,
    yoy: yoy ? {
      mtd_change: yoy.mtd_units ? (current.mtd_units-yoy.mtd_units)/yoy.mtd_units : null,
      last_7d_change: yoy.last_7d_units ? (current.last_7d_units-yoy.last_7d_units)/yoy.last_7d_units : null,
      current_mtd: current.mtd_units,
      yoy_mtd: yoy.mtd_units,
      current_last_7d: current.last_7d_units,
      yoy_last_7d: yoy.last_7d_units,
    } : null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).json({ ok:false,error:'GET required' }); }
    const weekStart=parseWeekStart(req.query?.week_start), targetMonth=weekStart.slice(0,7), sucursalId=req.query?.sucursal_id?parsePositiveBigInt(req.query.sucursal_id,'sucursal_id'):null, sql=getDb();
    const [rows, ventasUniverse, previousCutResult] = await Promise.all([
      sql.query(`SELECT wsp.projection_id::text AS projection_id,wsp.week_start::text AS week_start,wsp.sucursal_id::text AS sucursal_id,s.nombre_canonico AS sucursal,wsp.persona_id::text AS persona_id,COALESCE(p.nombre_canonico,p.usuario_canonico,wsp.source_vendedor_raw,'Sin vendedor') AS vendedor,wsp.modelo_id::text AS modelo_id,COALESCE(ma.nombre_canonico,wsp.source_brand_raw,'Sin marca') AS marca,COALESCE(m.nombre_canonico,wsp.source_model_raw,'Sin modelo') AS modelo,wsp.projected_units,wsp.expected_close_date::text AS expected_close_date,wsp.crm_opportunity_id,crm.estado AS crm_estado,crm.grado_interes AS crm_grado_interes,wsp.updated_at FROM public.weekly_sales_projection wsp JOIN public.sucursales_master s ON s.sucursal_id=wsp.sucursal_id LEFT JOIN public.personas_master p ON p.persona_id=wsp.persona_id LEFT JOIN public.modelos_master_v01 m ON m.modelo_id=wsp.modelo_id LEFT JOIN public.marcas_master_v01 ma ON ma.marca_id=m.marca_id LEFT JOIN LATERAL(SELECT c."Estado" AS estado,NULLIF(BTRIM(c."Grado de Interes"),'') AS grado_interes FROM public."CRM_Cidef_raw" c WHERE c."ID"=wsp.crm_opportunity_id ORDER BY c.loaded_at DESC NULLS LAST LIMIT 1)crm ON wsp.crm_opportunity_id IS NOT NULL WHERE wsp.week_start=$1::date AND ($2::bigint IS NULL OR wsp.sucursal_id=$2::bigint) ORDER BY s.nombre_canonico,vendedor,wsp.expected_close_date,marca,modelo`,[weekStart,sucursalId]),
      buildVentasUniverse({commercial_universe:'OWN_STORES',cutoff_date:weekStart}),
      sql.query(`SELECT MAX(week_start)::text AS previous_cut FROM public.weekly_sales_projection WHERE week_start < $1::date AND to_char(week_start,'YYYY-MM')=$2`,[weekStart,targetMonth]),
    ]);
    const summary=rows.reduce((acc,row)=>{const units=Number(row.projected_units||0);acc.total_units+=units;acc.rows+=1;if(row.crm_opportunity_id)acc.crm_units+=units;else acc.no_crm_units+=units;return acc;},{total_units:0,crm_units:0,no_crm_units:0,rows:0});
    const rawSalesMtd=buildSalesMtd(ventasUniverse,targetMonth,weekStart);
    const salesMtd=filterSalesByStore(rawSalesMtd,sucursalId);
    const previousCut=previousCutResult?.[0]?.previous_cut?String(previousCutResult[0].previous_cut).slice(0,10):null;
    let evolution=null;
    if(previousCut){
      const previousProjectionRows=await sql.query(`SELECT wsp.sucursal_id::text AS sucursal_id,s.nombre_canonico AS sucursal,wsp.projected_units FROM public.weekly_sales_projection wsp JOIN public.sucursales_master s ON s.sucursal_id=wsp.sucursal_id WHERE wsp.week_start=$1::date AND ($2::bigint IS NULL OR wsp.sucursal_id=$2::bigint)`,[previousCut,sucursalId]);
      const previousSales=filterSalesByStore(buildSalesMtd(ventasUniverse,targetMonth,previousCut),sucursalId);
      evolution=buildEvolution(previousCut,weekStart,previousProjectionRows,previousSales,salesMtd);
    }
    const historical_context=await buildHistoricalContext(ventasUniverse,weekStart,sucursalId);
    return res.status(200).json({ok:true,week_start:weekStart,sucursal_id:sucursalId,summary,sales_mtd:salesMtd,evolution,historical_context,projections:rows});
  } catch(error){return handleApiError(res,error);}
}
