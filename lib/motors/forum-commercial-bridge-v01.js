import { queryDb } from '../neon.js';
import * as forumCanonicalizer from './forum-canonicalizer-v01.js';

const TABLE = 'forum_crm_vin_bridge_v01';
const SOURCE = 'forum_raw';
const WINDOW_DAYS = 14;

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value) {
  const n = normalizeName(value);
  return n ? n.split(' ').filter(Boolean) : [];
}

function tokenSubset(needle, haystack) {
  const n = tokens(needle);
  if (n.length < 2) return false;
  const h = new Set(tokens(haystack));
  return n.every((t) => h.has(t));
}

function sqlNormalize(column) {
  return `btrim(regexp_replace(upper(translate(coalesce(${column},''),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNAEIOUUN')), '[^A-Z0-9]+', ' ', 'g'))`;
}

function crmDateExpr(alias = 'cr') {
  return `CASE
    WHEN coalesce(${alias}."Asignado el",'') ~ '^\\d{2}/\\d{2}/\\d{4}' THEN to_date(split_part(${alias}."Asignado el",' ',1),'DD/MM/YYYY')
    WHEN coalesce(${alias}."Asignado el",'') ~ '^\\d{4}-\\d{2}-\\d{2}' THEN left(${alias}."Asignado el",10)::date
    WHEN coalesce(${alias}."Creado el",'') ~ '^\\d{2}/\\d{2}/\\d{4}' THEN to_date(split_part(${alias}."Creado el",' ',1),'DD/MM/YYYY')
    WHEN coalesce(${alias}."Creado el",'') ~ '^\\d{4}-\\d{2}-\\d{2}' THEN left(${alias}."Creado el",10)::date
    ELSE NULL END`;
}

async function ensureSchema() {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS public.${TABLE} (
      numero_operacion bigint PRIMARY KEY REFERENCES public.forum_raw(numero_operacion),
      crm_deal_id text,
      crm_match_status text NOT NULL,
      crm_match_method text,
      crm_day_gap integer,
      vin text,
      vin_match_status text NOT NULL,
      crm_vin_match_method text,
      materialized_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_forum_crm_vin_bridge_crm ON public.${TABLE}(crm_deal_id)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_forum_crm_vin_bridge_vin ON public.${TABLE}(vin)`);
}

async function uniqueForumCrmCandidates() {
  return queryDb(`
    WITH crm AS (
      SELECT
        cr."ID" AS deal_id,
        NULLIF(upper(regexp_replace(coalesce(cr."Documento",''),'[^0-9Kk]','','g')),'') AS rut_normalizado,
        sa.sucursal_id,
        ${crmDateExpr('cr')} AS crm_date,
        cr."Asignado a" AS crm_seller
      FROM public."CRM_Cidef_raw" cr
      LEFT JOIN public.sucursal_aliases sa
        ON sa.fuente='CRM_Cidef_raw'
       AND sa.validated
       AND sa.valor_normalizado=${sqlNormalize('cr."Sucursal Asignada"')}
      WHERE coalesce(cr."ID",'')<>''
        AND coalesce(cr."Documento",'')<>''
    ), candidates AS (
      SELECT
        f.numero_operacion,
        f.rut_normalizado,
        f.sucursal_id,
        f.fecha_cotizacion::date AS forum_date,
        fr.vendedor AS forum_seller,
        c.deal_id,
        c.crm_date,
        c.crm_seller,
        abs(c.crm_date - f.fecha_cotizacion::date)::int AS day_gap,
        count(*) OVER (PARTITION BY f.numero_operacion) AS candidate_count
      FROM public.forum_operacion_canonica_v01 f
      JOIN public.forum_raw fr ON fr.numero_operacion=f.numero_operacion
      JOIN crm c
        ON c.rut_normalizado=f.rut_normalizado
       AND c.sucursal_id=f.sucursal_id
       AND c.crm_date BETWEEN f.fecha_cotizacion::date-${WINDOW_DAYS} AND f.fecha_cotizacion::date+${WINDOW_DAYS}
      WHERE f.rut_normalizado IS NOT NULL
        AND f.sucursal_id IS NOT NULL
    )
    SELECT * FROM candidates WHERE candidate_count=1
  `);
}

async function seedSellerAliasesFromCrm(uniqueMatches) {
  const unresolved = uniqueMatches.filter((row) => row.forum_seller && row.crm_seller);
  if (!unresolved.length) return { inserted: 0, candidates: 0 };

  const persons = await queryDb(`
    SELECT p.persona_id, p.nombre_canonico AS nombre, ps.sucursal_id, ps.valid_from, ps.valid_to, ps.vigente
    FROM public.personas_master p
    JOIN public.persona_sucursal ps ON ps.persona_id=p.persona_id AND ps.rol='VENDEDOR_TIENDA'
    JOIN public.sucursales_master sm ON sm.sucursal_id=ps.sucursal_id AND sm.tipo_canal='CIDEF'
    WHERE p.nombre_canonico IS NOT NULL
    UNION ALL
    SELECT pa.persona_id, pa.valor_raw AS nombre, ps.sucursal_id, ps.valid_from, ps.valid_to, ps.vigente
    FROM public.persona_aliases pa
    JOIN public.persona_sucursal ps ON ps.persona_id=pa.persona_id AND ps.rol='VENDEDOR_TIENDA'
    JOIN public.sucursales_master sm ON sm.sucursal_id=ps.sucursal_id AND sm.tipo_canal='CIDEF'
    WHERE pa.tipo_alias='nombre' AND pa.persona_id IS NOT NULL
  `);

  const evidence = new Map();
  for (const row of unresolved) {
    const forumDate = String(row.forum_date).slice(0, 10);
    const possible = new Set();
    for (const p of persons) {
      if (Number(p.sucursal_id) !== Number(row.sucursal_id)) continue;
      const from = p.valid_from ? String(p.valid_from).slice(0, 10) : null;
      const to = p.valid_to ? String(p.valid_to).slice(0, 10) : null;
      const dateValid = (!from || forumDate >= from) && (!to || forumDate <= to);
      if (!dateValid) continue;
      if (tokenSubset(row.crm_seller, p.nombre)) possible.add(Number(p.persona_id));
    }
    if (possible.size !== 1) continue;
    const personaId = [...possible][0];
    const key = normalizeName(row.forum_seller);
    if (!key) continue;
    if (!evidence.has(key)) evidence.set(key, { raw: row.forum_seller, ids: new Set(), ops: new Set() });
    const e = evidence.get(key);
    e.ids.add(personaId);
    e.ops.add(String(row.numero_operacion));
  }

  const existing = await queryDb(`SELECT valor_normalizado FROM public.persona_aliases WHERE fuente=$1 AND tipo_alias='nombre'`, [SOURCE]);
  const existingSet = new Set(existing.map((row) => row.valor_normalizado));
  const maxRows = await queryDb(`SELECT COALESCE(MAX(persona_alias_id),0)::bigint AS max_id FROM public.persona_aliases`);
  let nextId = Number(maxRows[0]?.max_id ?? 0) + 1;
  let inserted = 0;

  for (const [normalized, e] of evidence.entries()) {
    if (existingSet.has(normalized)) continue;
    if (e.ids.size !== 1 || e.ops.size < 2) continue;
    const personaId = [...e.ids][0];
    await queryDb(
      `INSERT INTO public.persona_aliases
       (persona_alias_id,persona_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,confidence,validated)
       VALUES ($1,$2,$3,$4,$5,'nombre','crm_rut_store_temporal_consensus_n2',1,true)
       ON CONFLICT (fuente,tipo_alias,valor_normalizado) DO NOTHING`,
      [nextId++, personaId, SOURCE, e.raw, normalized],
    );
    inserted++;
    existingSet.add(normalized);
  }

  return { inserted, candidates: evidence.size };
}

async function refreshBridge() {
  await queryDb(`
    INSERT INTO public.${TABLE} (
      numero_operacion,crm_deal_id,crm_match_status,crm_match_method,crm_day_gap,
      vin,vin_match_status,crm_vin_match_method,materialized_at
    )
    WITH crm AS (
      SELECT
        cr."ID" AS deal_id,
        NULLIF(upper(regexp_replace(coalesce(cr."Documento",''),'[^0-9Kk]','','g')),'') AS rut_normalizado,
        sa.sucursal_id,
        ${crmDateExpr('cr')} AS crm_date
      FROM public."CRM_Cidef_raw" cr
      LEFT JOIN public.sucursal_aliases sa
        ON sa.fuente='CRM_Cidef_raw'
       AND sa.validated
       AND sa.valor_normalizado=${sqlNormalize('cr."Sucursal Asignada"')}
      WHERE coalesce(cr."ID",'')<>''
        AND coalesce(cr."Documento",'')<>''
    ), candidates AS (
      SELECT
        f.numero_operacion,
        c.deal_id,
        abs(c.crm_date - f.fecha_cotizacion::date)::int AS day_gap,
        count(*) OVER (PARTITION BY f.numero_operacion) AS candidate_count
      FROM public.forum_operacion_canonica_v01 f
      JOIN crm c
        ON c.rut_normalizado=f.rut_normalizado
       AND c.sucursal_id=f.sucursal_id
       AND c.crm_date BETWEEN f.fecha_cotizacion::date-${WINDOW_DAYS} AND f.fecha_cotizacion::date+${WINDOW_DAYS}
      WHERE f.rut_normalizado IS NOT NULL AND f.sucursal_id IS NOT NULL
    ), unique_match AS (
      SELECT numero_operacion,deal_id,day_gap FROM candidates WHERE candidate_count=1
    ), ambiguous AS (
      SELECT DISTINCT numero_operacion FROM candidates WHERE candidate_count>1
    )
    SELECT
      f.numero_operacion,
      u.deal_id,
      CASE WHEN u.deal_id IS NOT NULL THEN 'MATCHED' WHEN a.numero_operacion IS NOT NULL THEN 'AMBIGUOUS' ELSE 'UNMATCHED' END,
      CASE WHEN u.deal_id IS NOT NULL THEN 'RUT_STORE_14D_UNIQUE' ELSE NULL END,
      u.day_gap,
      cv.vin,
      CASE WHEN cv.vin IS NOT NULL THEN 'MATCHED' WHEN u.deal_id IS NOT NULL THEN 'CRM_MATCH_NO_VIN' ELSE 'UNMATCHED' END,
      CASE WHEN cv.vin IS NOT NULL THEN cv.match_method ELSE NULL END,
      now()
    FROM public.forum_operacion_canonica_v01 f
    LEFT JOIN unique_match u ON u.numero_operacion=f.numero_operacion
    LEFT JOIN ambiguous a ON a.numero_operacion=f.numero_operacion
    LEFT JOIN public.crm_cidef_venta_link_v01 cv ON cv.deal_id=u.deal_id
    ON CONFLICT (numero_operacion) DO UPDATE SET
      crm_deal_id=EXCLUDED.crm_deal_id,
      crm_match_status=EXCLUDED.crm_match_status,
      crm_match_method=EXCLUDED.crm_match_method,
      crm_day_gap=EXCLUDED.crm_day_gap,
      vin=EXCLUDED.vin,
      vin_match_status=EXCLUDED.vin_match_status,
      crm_vin_match_method=EXCLUDED.crm_vin_match_method,
      materialized_at=now()
  `);

  const [stats] = await queryDb(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE crm_match_status='MATCHED')::int AS crm_matched,
      COUNT(*) FILTER (WHERE crm_match_status='AMBIGUOUS')::int AS crm_ambiguous,
      COUNT(*) FILTER (WHERE crm_match_status='UNMATCHED')::int AS crm_unmatched,
      COUNT(*) FILTER (WHERE vin IS NOT NULL)::int AS vin_matched
    FROM public.${TABLE}
  `);
  return stats;
}

export async function run() {
  const startedAt = Date.now();
  await ensureSchema();
  await forumCanonicalizer.run();
  const uniqueMatches = await uniqueForumCrmCandidates();
  const aliases = await seedSellerAliasesFromCrm(uniqueMatches);
  if (aliases.inserted > 0) await forumCanonicalizer.run();
  const stats = await refreshBridge();
  return {
    status: 'refreshed',
    table: TABLE,
    match_rule: `RUT + CIDEF_STORE + +/-${WINDOW_DAYS}D + UNIQUE_CRM_DEAL`,
    seller_alias_rule: 'CRM_RUT_STORE_TEMPORAL_CONSENSUS_N2',
    seller_aliases_inserted: aliases.inserted,
    seller_alias_candidates: aliases.candidates,
    coverage: {
      total: Number(stats.total),
      crm_matched: Number(stats.crm_matched),
      crm_ambiguous: Number(stats.crm_ambiguous),
      crm_unmatched: Number(stats.crm_unmatched),
      vin_matched: Number(stats.vin_matched),
    },
    elapsed_ms: Date.now() - startedAt,
  };
}
