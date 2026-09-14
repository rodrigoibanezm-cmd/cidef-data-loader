import { buildRvmUniverse } from '../rvm-universe/buildRvmUniverse.js';
import { buildVentasCommercialContext } from '../ventas-commercial/buildVentasCommercialContext.js';
import { getDb } from '../weekly-projections/db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(value) {
  const text = value == null || value === '' ? new Date().toISOString().slice(0, 10) : String(value);
  if (!DATE_RE.test(text) || Number.isNaN(new Date(text + 'T12:00:00Z').getTime())) {
    const error = new Error('date must use YYYY-MM-DD');
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function monthStart(month) { return month + '-01'; }
function monthOf(date) { return String(date).slice(0, 7); }
function shiftMonth(month, delta) {
  const parts = month.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
function monthCutoff(month, day) {
  const parts = month.split('-').map(Number);
  const last = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
  return month + '-' + String(Math.min(day, last)).padStart(2, '0');
}
function saleDate(row) { return String(row.fecha_venta_iso || '').slice(0, 10); }
function sum(rows, field) { return rows.reduce((total, row) => total + Number(row[field] || 0), 0); }
function ratio(n, d) { return d ? n / d : null; }
function percent(value) { return value == null ? null : Math.round(value * 1000) / 10; }
function round1(value) { return value == null ? null : Math.round(value * 10) / 10; }
function toneFor(delta) { return delta == null ? 'neutral' : delta >= 0.05 ? 'positive' : delta <= -0.05 ? 'critical' : 'warning'; }
function labelFor(delta) { return delta == null ? 'SIN EVIDENCIA' : delta >= 0.05 ? 'ADELANTADO' : delta <= -0.05 ? 'REZAGADO' : 'ESTABLE'; }

function salesByScope(sales, targetMonth, cutoffDate, storeId = null) {
  const day = Number(cutoffDate.slice(8, 10));
  const months = [0, -1, -2, -3, -4].map((offset) => shiftMonth(targetMonth, offset));
  const values = months.map((month) => {
    const from = month + '-02';
    const to = monthCutoff(month, day);
    return sales.filter((row) => {
      if (row.mes_venta !== month) return false;
      if (storeId != null && String(row.sucursal_venta_id) !== String(storeId)) return false;
      const date = saleDate(row);
      return date >= from && date <= to;
    }).length;
  });
  const current = values[0];
  const baselineValues = values.slice(1);
  const baseline = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
  const delta = baseline ? (current - baseline) / baseline : null;
  const yoyMonth = shiftMonth(targetMonth, -12);
  const yoy = sales.filter((row) => {
    if (row.mes_venta !== yoyMonth) return false;
    if (storeId != null && String(row.sucursal_venta_id) !== String(storeId)) return false;
    const date = saleDate(row);
    return date >= yoyMonth + '-02' && date <= monthCutoff(yoyMonth, day);
  }).length;
  return { current, baseline: round1(baseline), delta, yoy, yoy_delta: yoy ? (current - yoy) / yoy : null, trend: [...values].reverse() };
}

function card(title, value, unit, status, tone, change, detail, cutoff, trend = []) {
  return { title, value, unit, status, tone, change, detail, cutoff, trend };
}

function crmCard(row, cutoff) {
  const leads = Number(row?.leads || 0);
  const managed = Number(row?.managed || 0);
  const ready = Number(row?.ready || 0);
  const managedRatio = ratio(managed, leads);
  const delta = managedRatio == null ? null : managedRatio - 0.7;
  return card('CRM', leads, 'leads', labelFor(delta), toneFor(delta),
    managedRatio == null ? 'Sin base comparable' : percent(managedRatio) + '% gestionados',
    ready + ' interesados/listos', cutoff, [Number(row?.unmanaged || 0), managed, ready]);
}

function projectionCard(row, cutoff) {
  const committed = Number(row?.current_projection || 0);
  const fulfillment = row?.fulfillment == null ? null : Number(row.fulfillment);
  const delta = fulfillment == null ? null : fulfillment - 0.7;
  return card('PROYECCIONES', committed, 'VIN', committed ? 'EN SEGUIMIENTO' : 'SIN EVIDENCIA',
    committed ? toneFor(delta) : 'neutral',
    fulfillment == null ? 'Sin corte anterior comparable' : percent(fulfillment) + '% convertido',
    row?.previous_projection ? Number(row.previous_projection) + ' VIN comprometidos en corte anterior' : 'Sin compromiso previo',
    cutoff, [Number(row?.previous_projection || 0), committed]);
}

function forumCard(forum, cutoff) {
  const total = Number(forum?.quotes || 0);
  return card('FORUM', total || '—', total ? 'cotizaciones' : '', 'EN CALIBRACIÓN', 'neutral',
    total ? Number(forum.approved || 0) + ' aprobadas/aceptadas' : 'Cobertura insuficiente',
    total ? Number(forum.linked || 0) + ' vinculadas a operación canónica' : 'Sin señal publicable',
    cutoff, []);
}

async function loadCrm(sql, from, to) {
  return sql.query(`
    WITH latest AS (
      SELECT DISTINCT ON (c."ID") c.*
      FROM public."CRM_Cidef_raw" c
      WHERE NULLIF(c."ID",'') IS NOT NULL
      ORDER BY c."ID", c.loaded_at DESC NULLS LAST, c.source_file DESC NULLS LAST
    ), parsed AS (
      SELECT l.*,
        CASE
          WHEN trim(l."Creado el") ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN trim(l."Creado el")::timestamp
          WHEN trim(l."Creado el") ~ '^\\d{2}/\\d{2}/\\d{4}' THEN to_timestamp(trim(l."Creado el"),'DD/MM/YYYY HH24:MI:SS')::timestamp
          ELSE NULL
        END AS created_at
      FROM latest l
    ), resolved AS (
      SELECT p.*, store.sucursal_id, store.sucursal
      FROM parsed p
      JOIN LATERAL (
        SELECT sm.sucursal_id, sm.nombre_canonico AS sucursal
        FROM public.sucursal_aliases sa
        JOIN public.sucursales_master sm ON sm.sucursal_id=sa.sucursal_id
        WHERE sa.fuente='CRM_Cidef_raw' AND sa.validated=true
          AND sa.valor_raw=p."Sucursal Asignada"
          AND sm.tipo_canal='CIDEF' AND sm.vigente=true
        ORDER BY sa.sucursal_alias_id LIMIT 1
      ) store ON true
      WHERE p.created_at::date BETWEEN $1::date AND $2::date
    )
    SELECT sucursal_id::text AS sucursal_id, max(sucursal) AS sucursal,
      count(*)::int AS leads,
      count(*) FILTER (WHERE "Estado" IN ('En Gestion','Oportunidad','Cerrado'))::int AS managed,
      count(*) FILTER (WHERE "Estado"='Sin Gestion')::int AS unmanaged,
      count(*) FILTER (WHERE "Estado"='Oportunidad')::int AS opportunities,
      count(*) FILTER (WHERE "Grado de Interes" IN ('3 - Interesado','4 - Listo para comprar'))::int AS ready,
      count(*) FILTER (WHERE "Vendido"='Si')::int AS won
    FROM resolved GROUP BY sucursal_id ORDER BY max(sucursal)
  `, [from, to]);
}

async function loadProjection(sql, month, sales, cutoff, projectionCutoff = cutoff) {
  const cuts = await sql.query(`
    SELECT DISTINCT week_start::text AS week_start
    FROM public.weekly_sales_projection
    WHERE to_char(week_start,'YYYY-MM')=$1 AND week_start <= $2::date
    ORDER BY week_start DESC LIMIT 2
  `, [month, cutoff]);
  const currentCut = cuts[0]?.week_start || null;
  const previousCut = cuts[1]?.week_start || null;
  if (!currentCut) return { company: {}, stores: new Map(), currentCut: null, previousCut: null };
  const rows = await sql.query(`
    SELECT week_start::text AS week_start, sucursal_id::text AS sucursal_id,
           sum(projected_units)::int AS projected_units
    FROM public.weekly_sales_projection
    WHERE week_start = ANY($1::date[])
    GROUP BY week_start, sucursal_id
  `, [[currentCut, previousCut].filter(Boolean)]);
  const stores = new Map();
  const storeIds = new Set(rows.map((row) => String(row.sucursal_id)));
  const make = (storeId = null) => {
    const currentProjection = sum(rows.filter((r) => r.week_start === currentCut && (storeId == null || String(r.sucursal_id) === storeId)), 'projected_units');
    const previousProjection = previousCut
      ? sum(rows.filter((r) => r.week_start === previousCut && (storeId == null || String(r.sucursal_id) === storeId)), 'projected_units') : 0;
    const newSales = previousCut ? sales.filter((sale) => {
      if (storeId != null && String(sale.sucursal_venta_id) !== storeId) return false;
      const date = saleDate(sale);
      return date > previousCut && date <= cutoff && sale.mes_venta === month;
    }).length : 0;
    return { current_projection: currentProjection, previous_projection: previousProjection,
      new_sales: newSales, fulfillment: previousProjection ? newSales / previousProjection : null };
  };
  for (const id of storeIds) stores.set(id, make(id));
  return { company: make(), stores, currentCut, previousCut };
}

async function loadRvm(sql, month, cutoff) {
  const inventory = await sql.query(`
    SELECT snapshot_date::text AS snapshot_date, max(fecha)::text AS data_through
    FROM public.rvm_raw
    WHERE data_status='PRELIMINARY' AND to_char(fecha,'YYYY-MM')=$1
      AND snapshot_date <= $2::date
    GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 1
  `, [month, cutoff]);
  const snapshot = inventory[0]?.snapshot_date || null;
  if (!snapshot) return { card: card('RVM', '—', '', 'SIN EVIDENCIA', 'neutral', 'Sin preliminar vigente', 'Mercado no disponible', null, []), snapshot: null };
  const input = { date_from: monthStart(month), date_to: cutoff, cutoff_date: cutoff,
    data_status: 'PRELIMINARY', snapshot_date: snapshot };
  const [market, cidef] = await Promise.all([
    buildRvmUniverse({ ...input, organization_scope: 'ALL' }),
    buildRvmUniverse({ ...input, organization_scope: 'CIDEF' }),
  ]);
  const marketUnits = sum(market.analytical_events || [], 'cantidad');
  const cidefUnits = sum((cidef.analytical_events || []).filter((r) => r.organization_bucket === 'INCLUDED'), 'cantidad');
  const penetration = ratio(cidefUnits, marketUnits);
  return {
    card: card('RVM', penetration == null ? '—' : percent(penetration), penetration == null ? '' : '%',
      penetration == null ? 'SIN EVIDENCIA' : 'EN OBSERVACIÓN', penetration == null ? 'neutral' : 'warning',
      cidefUnits + ' VIN DFM', 'Mercado ' + marketUnits + ' VIN', inventory[0].data_through || snapshot, [marketUnits, cidefUnits]),
    snapshot,
  };
}

function companyCrm(rows) {
  return {
    leads: sum(rows, 'leads'), managed: sum(rows, 'managed'), unmanaged: sum(rows, 'unmanaged'),
    opportunities: sum(rows, 'opportunities'), ready: sum(rows, 'ready'), won: sum(rows, 'won'),
  };
}

function signal(scopeType, scopeId, signalType, priority, tone, title, summary, impactValue, impactUnit, domains, evidenceAsOf, evidence) {
  return { scope_type: scopeType, scope_id: scopeId, signal_type: signalType, priority, tone,
    title, summary, impact_value: impactValue, impact_unit: impactUnit, domains,
    evidence_as_of: evidenceAsOf, evidence };
}

export async function materializeDashboard({ requestedDate } = {}) {
  const requested = isoDate(requestedDate);
  const sql = getDb();
  const ventas = await buildVentasCommercialContext({ commercial_universe: 'OWN_STORES', cutoff_date: requested }, { includeSourceContextDetails: true });
  if (ventas?.validation?.valid !== true) throw new Error('OWN_STORES ventas context is not valid');
  const cutoff = ventas.source_context?.effective_cutoff_date || requested;
  const month = monthOf(cutoff);
  const from = monthStart(month);
  const storesRows = await sql.query(`
    SELECT sucursal_id::text AS sucursal_id, nombre_canonico AS sucursal
    FROM public.sucursales_master
    WHERE tipo_canal='CIDEF' AND vigente=true
    ORDER BY nombre_canonico
  `);
  const [crmRows, forumRows, projection, rvm] = await Promise.all([
    loadCrm(sql, from, requested),
    sql.query(`
      SELECT count(*)::int AS quotes,
        count(*) FILTER (WHERE master_norm(COALESCE(estado_final_revision,estado_final)) IN ('APROBADO','ACEPTADO'))::int AS approved,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM public.forum_operacion_canonica_v01 f
          WHERE f.numero_operacion=forum_raw.numero_operacion
        ))::int AS linked,
        max(fecha_cotizacion)::date::text AS data_through
      FROM public.forum_raw
      WHERE fecha_cotizacion::date BETWEEN $1::date AND $2::date
    `, [from, requested]),
    loadProjection(sql, month, ventas.sales || [], cutoff, requested),
    loadRvm(sql, month, requested),
  ]);
  const forum = forumRows[0] || {};
  const salesCompany = salesByScope(ventas.sales || [], month, cutoff);
  const salesDelta = salesCompany.delta;
  const crmCompany = companyCrm(crmRows);
  const storePayloads = [];
  const storeMetrics = [];
  for (const store of storesRows) {
    const sales = salesByScope(ventas.sales || [], month, cutoff, store.sucursal_id);
    const crm = crmRows.find((row) => String(row.sucursal_id) === String(store.sucursal_id)) || {};
    const proj = projection.stores.get(String(store.sucursal_id)) || {};
    const salesCard = card('VENTAS', sales.current, 'VIN', labelFor(sales.delta), toneFor(sales.delta),
      sales.delta == null ? 'Sin referencia' : (sales.delta >= 0 ? '+' : '') + percent(sales.delta) + '% vs referencia',
      sales.yoy_delta == null ? 'YoY sin base comparable' : 'YoY ' + (sales.yoy_delta >= 0 ? '+' : '') + percent(sales.yoy_delta) + '%',
      cutoff, sales.trend);
    const cards = { sales: salesCard, rvm: { ...rvm.card, detail: 'Referencia de mercado de la red CIDEF' },
      crm: crmCard(crm, requested), forum: forumCard({}, forum.data_through || null),
      projections: projectionCard(proj, projection.currentCut) };
    storeMetrics.push({ store, sales, crm, proj });
    storePayloads.push({ sucursal_id: store.sucursal_id, payload: {
      scope: { type: 'STORE', id: store.sucursal_id, name: store.sucursal },
      verdict: { tone: salesCard.tone, title: store.sucursal + ': ' + salesCard.status.toLowerCase(),
        description: salesCard.change + '; ' + Number(crm.ready || 0) + ' oportunidades interesadas/listas.' },
      cards, source_cutoffs: { ventas: cutoff, rvm: rvm.card.cutoff, crm: requested,
        forum: forum.data_through || null, proyecciones: projection.currentCut },
    } });
  }
  const signals = [];
  const declining = storeMetrics.filter((x) => x.sales.delta != null && x.sales.delta <= -0.05)
    .sort((a, b) => a.sales.delta - b.sales.delta);
  const growing = storeMetrics.filter((x) => x.sales.delta != null && x.sales.delta >= 0.05)
    .sort((a, b) => b.sales.delta - a.sales.delta);
  for (const item of declining.slice(0, 2)) {
    const gap = Math.round(item.sales.current - item.sales.baseline);
    const evidence = { current: item.sales.current, baseline: item.sales.baseline, delta: item.sales.delta };
    const title = item.store.sucursal + ' pierde ritmo comercial';
    const summary = item.sales.current + ' VIN versus referencia de ' + item.sales.baseline + '.';
    signals.push(signal('COMPANY', null, 'EXPLANATION', 1, 'CRITICAL',
      title, summary, gap, 'VIN', ['VENTAS','TIENDA'], cutoff, evidence));
    signals.push(signal('STORE', item.store.sucursal_id, 'EXPLANATION', 1, 'CRITICAL',
      title, summary, gap, 'VIN', ['VENTAS','TIENDA'], cutoff, evidence));
  }
  for (const item of growing.slice(0, Math.max(0, 3 - signals.length))) {
    const gap = Math.round(item.sales.current - item.sales.baseline);
    const evidence = { current: item.sales.current, baseline: item.sales.baseline, delta: item.sales.delta };
    const title = item.store.sucursal + ' sostiene el crecimiento';
    const summary = item.sales.current + ' VIN versus referencia de ' + item.sales.baseline + '.';
    signals.push(signal('COMPANY', null, 'EXPLANATION', 3, 'POSITIVE',
      title, summary, gap, 'VIN', ['VENTAS','TIENDA'], cutoff, evidence));
    signals.push(signal('STORE', item.store.sucursal_id, 'EXPLANATION', 3, 'POSITIVE',
      title, summary, gap, 'VIN', ['VENTAS','TIENDA'], cutoff, evidence));
  }
  const actionCandidates = storeMetrics.filter((x) => Number(x.crm.ready || 0) > 0)
    .sort((a, b) => Number(b.crm.ready || 0) - Number(a.crm.ready || 0));
  for (const item of actionCandidates.slice(0, 2)) {
    const ready = Number(item.crm.ready || 0);
    const priority = item.sales.delta != null && item.sales.delta < 0 ? 1 : 2;
    const tone = item.sales.delta != null && item.sales.delta < 0 ? 'CRITICAL' : 'WARNING';
    const title = 'Revisar oportunidades listas en ' + item.store.sucursal;
    const summary = ready + ' oportunidades interesadas/listas requieren seguimiento de cierre.';
    const evidence = { ready, sales_current: item.sales.current, sales_delta: item.sales.delta };
    signals.push(signal('COMPANY', null, 'ACTION', priority, tone, title, summary, ready, 'CASOS',
      ['CRM','VENTAS'], requested, evidence));
    signals.push(signal('STORE', item.store.sucursal_id, 'ACTION', priority, tone, title, summary, ready, 'CASOS',
      ['CRM','VENTAS'], requested, evidence));
  }
  const companyCards = {
    sales: card('VENTAS', salesCompany.current, 'VIN', labelFor(salesDelta), toneFor(salesDelta),
      salesDelta == null ? 'Sin referencia' : (salesDelta >= 0 ? '+' : '') + percent(salesDelta) + '% vs referencia',
      salesCompany.yoy_delta == null ? 'YoY sin base comparable' : 'YoY ' + (salesCompany.yoy_delta >= 0 ? '+' : '') + percent(salesCompany.yoy_delta) + '%',
      cutoff, salesCompany.trend),
    rvm: rvm.card,
    crm: crmCard(crmCompany, requested),
    forum: forumCard(forum, forum.data_through || null),
    projections: projectionCard(projection.company, projection.currentCut),
  };
  const alertCount = signals.filter((s) => s.scope_type === 'COMPANY' && s.signal_type === 'ACTION' && ['CRITICAL','WARNING'].includes(s.tone)).length;
  const companyPayload = {
    scope: { type: 'COMPANY', commercial_universe: 'OWN_STORES', name: 'Red CIDEF' },
    header: { title: 'CIDEF · Cómo vamos', period: month, commercial_month_starts_day: 2 },
    verdict: {
      tone: salesCompany.delta != null && salesCompany.delta < -0.05 ? 'critical' : declining.length ? 'warning' : 'positive',
      title: salesCompany.delta != null && salesCompany.delta < -0.05
        ? 'Ritmo bajo la referencia, con ' + declining.length + ' tiendas que requieren atención'
        : declining.length
          ? 'Ritmo estable, con ' + declining.length + ' tiendas que requieren atención'
          : 'Ritmo comercial estable, sin deterioros relevantes',
      description: companyCards.sales.change + '; CRM con ' + crmCompany.ready + ' oportunidades interesadas/listas.',
      primary_value: salesCompany.current, primary_label: 'VIN MTD', alerts: alertCount,
    },
    cards: companyCards,
    source_cutoffs: { ventas: cutoff, rvm: rvm.card.cutoff, crm: requested,
      forum: forum.data_through || null, proyecciones: projection.currentCut },
  };
  const insertRows = await sql.query(`
    WITH company_insert AS (
      INSERT INTO public.dashboard_company_snapshot_v01
        (period_month,snapshot_date,contract_version,payload,published)
      VALUES ($1::date,$2::date,'dashboard_snapshot_v01_1',$3::jsonb,true)
      RETURNING snapshot_id
    ), store_insert AS (
      INSERT INTO public.dashboard_store_snapshot_v01(snapshot_id,sucursal_id,payload)
      SELECT c.snapshot_id,x.sucursal_id,x.payload
      FROM company_insert c
      CROSS JOIN jsonb_to_recordset($4::jsonb) AS x(sucursal_id bigint,payload jsonb)
      RETURNING 1
    ), signal_insert AS (
      INSERT INTO public.dashboard_signal_v01
        (snapshot_id,scope_type,scope_id,signal_type,priority,tone,title,summary,
         impact_value,impact_unit,domains,evidence_as_of,evidence)
      SELECT c.snapshot_id,x.scope_type,x.scope_id,x.signal_type,x.priority,x.tone,x.title,x.summary,
             x.impact_value,x.impact_unit,x.domains,x.evidence_as_of,x.evidence
      FROM company_insert c
      CROSS JOIN jsonb_to_recordset($5::jsonb) AS x(
        scope_type text,scope_id bigint,signal_type text,priority smallint,tone text,title text,summary text,
        impact_value numeric,impact_unit text,domains text[],evidence_as_of date,evidence jsonb)
      RETURNING 1
    )
    SELECT c.snapshot_id::text AS snapshot_id,
      (SELECT count(*) FROM store_insert)::int AS stores,
      (SELECT count(*) FROM signal_insert)::int AS signals
    FROM company_insert c
  `, [monthStart(month), cutoff, JSON.stringify(companyPayload), JSON.stringify(storePayloads), JSON.stringify(signals)]);
  return { ...insertRows[0], snapshot_date: cutoff, period_month: monthStart(month) };
}
