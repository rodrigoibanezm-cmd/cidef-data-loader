import { queryDb } from '../neon.js';
import { buildCrmUniverseQuery } from '../crm-universe/buildCrmUniverse.js';

const TABLE = 'commercial_operation_master_v01';
const ENGINE = 'commercial_operation_master_v01';
const VERSION = '0.1';

function crmLoadedAtExpr(alias = 'cr') {
  return `CASE
    WHEN nullif(trim(${alias}.loaded_at),'') IS NULL THEN NULL
    WHEN trim(${alias}.loaded_at) ~ '^\\d{4}-\\d{2}-\\d{2}[T ]' THEN trim(${alias}.loaded_at)::timestamptz
    ELSE NULL END`;
}

function consensus3(a, b, c) {
  const conflict = `((${a} IS NOT NULL AND ${b} IS NOT NULL AND ${a}<>${b}) OR (${a} IS NOT NULL AND ${c} IS NOT NULL AND ${a}<>${c}) OR (${b} IS NOT NULL AND ${c} IS NOT NULL AND ${b}<>${c}))`;
  return `CASE WHEN ${conflict} THEN NULL ELSE coalesce(${a},${b},${c}) END`;
}

function conflict3(a, b, c) {
  return `((${a} IS NOT NULL AND ${b} IS NOT NULL AND ${a}<>${b}) OR (${a} IS NOT NULL AND ${c} IS NOT NULL AND ${a}<>${c}) OR (${b} IS NOT NULL AND ${c} IS NOT NULL AND ${b}<>${c}))`;
}

async function ensureSchema() {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS public.${TABLE} (
      commercial_operation_id text PRIMARY KEY,
      operation_status text NOT NULL,
      forum_numero_operacion bigint,
      crm_deal_id text,
      vin text,
      rut_normalizado text,
      sucursal_id bigint,
      persona_id bigint,
      marca_id bigint,
      modelo_id bigint,
      forum_sucursal_id bigint,
      crm_sucursal_id bigint,
      vin_sucursal_id bigint,
      forum_persona_id bigint,
      crm_persona_id bigint,
      forum_marca_id bigint,
      crm_marca_id bigint,
      vin_marca_id bigint,
      forum_modelo_id bigint,
      crm_modelo_id bigint,
      vin_modelo_id bigint,
      forum_fecha_cotizacion timestamp without time zone,
      crm_created_at date,
      crm_assigned_at date,
      fecha_factura date,
      forum_estado text,
      forum_estado_revision text,
      crm_estado text,
      crm_vendido_raw text,
      vendido boolean NOT NULL DEFAULT false,
      forum_present boolean NOT NULL,
      crm_present boolean NOT NULL,
      vin_present boolean NOT NULL,
      forum_crm_match_status text NOT NULL,
      forum_crm_match_method text,
      forum_crm_day_gap integer,
      crm_vin_match_status text NOT NULL,
      crm_vin_match_method text,
      crm_forum_match_count integer NOT NULL DEFAULT 0,
      identity_status text NOT NULL,
      materialized_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await queryDb(`CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_operation_master_forum ON public.${TABLE}(forum_numero_operacion) WHERE forum_numero_operacion IS NOT NULL`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_commercial_operation_master_crm ON public.${TABLE}(crm_deal_id)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_commercial_operation_master_vin ON public.${TABLE}(vin)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_commercial_operation_master_store_seller ON public.${TABLE}(sucursal_id,persona_id)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_commercial_operation_master_product ON public.${TABLE}(marca_id,modelo_id)`);
  await queryDb(`CREATE INDEX IF NOT EXISTS idx_commercial_operation_master_status ON public.${TABLE}(operation_status)`);
}

function buildSourceSql(materializedAtParam = '$1') {
  const crmUniverse = buildCrmUniverseQuery({ eligibilityDateAxis: 'ASSIGNED_AT' });
  const storeConsensus = consensus3('f.sucursal_id', 'c.sucursal_id', 'v.sucursal_venta_id');
  const brandConsensus = consensus3('f.marca_id', 'c.brand_id', 'v.marca_id');
  const modelConsensus = consensus3('f.modelo_id', 'c.model_id', 'v.modelo_id');
  const sellerConflict = `(f.persona_id IS NOT NULL AND c.persona_id IS NOT NULL AND f.persona_id<>c.persona_id)`;
  const anyConflict = `(${conflict3('f.sucursal_id', 'c.sucursal_id', 'v.sucursal_venta_id')} OR ${sellerConflict} OR ${conflict3('f.marca_id', 'c.brand_id', 'v.marca_id')} OR ${conflict3('f.modelo_id', 'c.model_id', 'v.modelo_id')})`;

  return `
    WITH crm_universe_all AS MATERIALIZED (
      ${crmUniverse}
    ),
    crm_current AS MATERIALIZED (
      SELECT * FROM crm_universe_all WHERE rn=1
    ),
    crm_raw_latest AS MATERIALIZED (
      SELECT DISTINCT ON ("ID")
        "ID"::text deal_id,
        NULLIF(upper(regexp_replace(coalesce("Documento",''),'[^0-9Kk]','','g')),'') rut_normalizado,
        "Vendido" crm_vendido_raw
      FROM public."CRM_Cidef_raw" cr
      WHERE coalesce("ID",'')<>''
      ORDER BY "ID", ${crmLoadedAtExpr('cr')} DESC NULLS LAST, ctid DESC
    ),
    vin_identity AS MATERIALIZED (
      SELECT
        vc.vin,
        vc.sucursal_venta_id,
        vc.fecha_factura::date fecha_factura,
        mm.marca_id,
        mm.modelo_id
      FROM public.vehiculo_canonico vc
      LEFT JOIN public.versiones_master_v01 vm ON vm.version_id=vc.version_id
      LEFT JOIN public.modelos_master_v01 mm ON mm.modelo_id=vm.modelo_id
    ),
    bridge_cardinality AS MATERIALIZED (
      SELECT crm_deal_id,count(*)::int crm_forum_match_count
      FROM public.forum_crm_vin_bridge_v01
      WHERE crm_match_status='MATCHED' AND crm_deal_id IS NOT NULL
      GROUP BY crm_deal_id
    ),
    matched_crm AS MATERIALIZED (
      SELECT DISTINCT crm_deal_id
      FROM public.forum_crm_vin_bridge_v01
      WHERE crm_match_status='MATCHED' AND crm_deal_id IS NOT NULL
    ),
    forum_rows AS (
      SELECT
        'FORUM:'||f.numero_operacion::text commercial_operation_id,
        CASE
          WHEN b.crm_match_status='MATCHED' AND l.vin IS NOT NULL THEN 'FORUM_CRM_VIN'
          WHEN b.crm_match_status='MATCHED' THEN 'FORUM_CRM'
          ELSE 'FORUM_ONLY'
        END operation_status,
        f.numero_operacion forum_numero_operacion,
        CASE WHEN b.crm_match_status='MATCHED' THEN b.crm_deal_id END crm_deal_id,
        CASE WHEN b.crm_match_status='MATCHED' THEN l.vin END vin,
        CASE
          WHEN b.crm_match_status='MATCHED' AND f.rut_normalizado IS NOT NULL AND r.rut_normalizado IS NOT NULL AND f.rut_normalizado<>r.rut_normalizado THEN NULL
          ELSE coalesce(f.rut_normalizado,r.rut_normalizado)
        END rut_normalizado,
        ${storeConsensus} sucursal_id,
        CASE WHEN ${sellerConflict} THEN NULL ELSE coalesce(f.persona_id,c.persona_id) END persona_id,
        ${brandConsensus} marca_id,
        ${modelConsensus} modelo_id,
        f.sucursal_id forum_sucursal_id,c.sucursal_id crm_sucursal_id,v.sucursal_venta_id vin_sucursal_id,
        f.persona_id forum_persona_id,c.persona_id crm_persona_id,
        f.marca_id forum_marca_id,c.brand_id crm_marca_id,v.marca_id vin_marca_id,
        f.modelo_id forum_modelo_id,c.model_id crm_modelo_id,v.modelo_id vin_modelo_id,
        f.fecha_cotizacion forum_fecha_cotizacion,
        c.created_date::date crm_created_at,c.assigned_date::date crm_assigned_at,
        coalesce(l.erp_fecha_factura,v.fecha_factura) fecha_factura,
        f.estado_final forum_estado,f.estado_final_revision forum_estado_revision,
        c.estado_raw crm_estado,r.crm_vendido_raw,
        (l.vin IS NOT NULL) vendido,
        true forum_present,
        (b.crm_match_status='MATCHED' AND b.crm_deal_id IS NOT NULL) crm_present,
        (l.vin IS NOT NULL) vin_present,
        coalesce(b.crm_match_status,'UNMATCHED') forum_crm_match_status,
        b.crm_match_method forum_crm_match_method,b.crm_day_gap forum_crm_day_gap,
        CASE WHEN l.vin IS NOT NULL THEN 'MATCHED' WHEN b.crm_match_status='MATCHED' THEN 'UNMATCHED' ELSE 'NOT_APPLICABLE' END crm_vin_match_status,
        l.match_method crm_vin_match_method,
        coalesce(bc.crm_forum_match_count,0) crm_forum_match_count,
        CASE
          WHEN b.crm_match_status='MATCHED' AND coalesce(bc.crm_forum_match_count,0)>1 THEN 'MANY_FORUM_TO_ONE_CRM'
          WHEN b.crm_match_status='MATCHED' AND (f.rut_normalizado IS NOT NULL AND r.rut_normalizado IS NOT NULL AND f.rut_normalizado<>r.rut_normalizado) THEN 'SOURCE_CONFLICT'
          WHEN b.crm_match_status='MATCHED' AND ${anyConflict} THEN 'SOURCE_CONFLICT'
          WHEN b.crm_match_status='MATCHED' THEN 'CONSISTENT'
          ELSE 'SINGLE_SOURCE'
        END identity_status,
        ${materializedAtParam}::timestamptz materialized_at
      FROM public.forum_operacion_canonica_v01 f
      LEFT JOIN public.forum_crm_vin_bridge_v01 b ON b.numero_operacion=f.numero_operacion
      LEFT JOIN crm_current c ON c.lead_id=b.crm_deal_id AND b.crm_match_status='MATCHED'
      LEFT JOIN crm_raw_latest r ON r.deal_id=b.crm_deal_id AND b.crm_match_status='MATCHED'
      LEFT JOIN public.crm_cidef_venta_link_v01 l ON l.deal_id=b.crm_deal_id AND b.crm_match_status='MATCHED'
      LEFT JOIN vin_identity v ON v.vin=l.vin
      LEFT JOIN bridge_cardinality bc ON bc.crm_deal_id=b.crm_deal_id AND b.crm_match_status='MATCHED'
    ),
    crm_only_rows AS (
      SELECT
        'CRM:'||c.lead_id::text commercial_operation_id,
        CASE WHEN l.vin IS NOT NULL THEN 'CRM_VIN' ELSE 'CRM_ONLY' END operation_status,
        NULL::bigint forum_numero_operacion,
        c.lead_id crm_deal_id,
        l.vin,
        r.rut_normalizado,
        ${consensus3('NULL::bigint', 'c.sucursal_id', 'v.sucursal_venta_id')} sucursal_id,
        c.persona_id,
        ${consensus3('NULL::bigint', 'c.brand_id', 'v.marca_id')} marca_id,
        ${consensus3('NULL::bigint', 'c.model_id', 'v.modelo_id')} modelo_id,
        NULL::bigint forum_sucursal_id,c.sucursal_id crm_sucursal_id,v.sucursal_venta_id vin_sucursal_id,
        NULL::bigint forum_persona_id,c.persona_id crm_persona_id,
        NULL::bigint forum_marca_id,c.brand_id crm_marca_id,v.marca_id vin_marca_id,
        NULL::bigint forum_modelo_id,c.model_id crm_modelo_id,v.modelo_id vin_modelo_id,
        NULL::timestamp without time zone forum_fecha_cotizacion,
        c.created_date::date crm_created_at,c.assigned_date::date crm_assigned_at,
        coalesce(l.erp_fecha_factura,v.fecha_factura) fecha_factura,
        NULL::text forum_estado,NULL::text forum_estado_revision,
        c.estado_raw crm_estado,r.crm_vendido_raw,
        (l.vin IS NOT NULL) vendido,
        false forum_present,true crm_present,(l.vin IS NOT NULL) vin_present,
        'NOT_APPLICABLE' forum_crm_match_status,
        NULL::text forum_crm_match_method,NULL::integer forum_crm_day_gap,
        CASE WHEN l.vin IS NOT NULL THEN 'MATCHED' ELSE 'UNMATCHED' END crm_vin_match_status,
        l.match_method crm_vin_match_method,
        0 crm_forum_match_count,
        CASE
          WHEN ${conflict3('NULL::bigint', 'c.sucursal_id', 'v.sucursal_venta_id')} OR ${conflict3('NULL::bigint', 'c.brand_id', 'v.marca_id')} OR ${conflict3('NULL::bigint', 'c.model_id', 'v.modelo_id')} THEN 'SOURCE_CONFLICT'
          ELSE 'SINGLE_SOURCE'
        END identity_status,
        ${materializedAtParam}::timestamptz materialized_at
      FROM crm_current c
      JOIN crm_raw_latest r ON r.deal_id=c.lead_id
      LEFT JOIN matched_crm m ON m.crm_deal_id=c.lead_id
      LEFT JOIN public.crm_cidef_venta_link_v01 l ON l.deal_id=c.lead_id
      LEFT JOIN vin_identity v ON v.vin=l.vin
      WHERE m.crm_deal_id IS NULL
    )
    SELECT * FROM forum_rows
    UNION ALL
    SELECT * FROM crm_only_rows
  `;
}

async function refreshMaster(materializedAt) {
  const sourceSql = buildSourceSql('$1');
  await queryDb(`
    INSERT INTO public.${TABLE} (
      commercial_operation_id,operation_status,forum_numero_operacion,crm_deal_id,vin,rut_normalizado,
      sucursal_id,persona_id,marca_id,modelo_id,
      forum_sucursal_id,crm_sucursal_id,vin_sucursal_id,forum_persona_id,crm_persona_id,
      forum_marca_id,crm_marca_id,vin_marca_id,forum_modelo_id,crm_modelo_id,vin_modelo_id,
      forum_fecha_cotizacion,crm_created_at,crm_assigned_at,fecha_factura,
      forum_estado,forum_estado_revision,crm_estado,crm_vendido_raw,vendido,
      forum_present,crm_present,vin_present,forum_crm_match_status,forum_crm_match_method,forum_crm_day_gap,
      crm_vin_match_status,crm_vin_match_method,crm_forum_match_count,identity_status,materialized_at
    )
    ${sourceSql}
    ON CONFLICT (commercial_operation_id) DO UPDATE SET
      operation_status=EXCLUDED.operation_status,
      forum_numero_operacion=EXCLUDED.forum_numero_operacion,
      crm_deal_id=EXCLUDED.crm_deal_id,
      vin=EXCLUDED.vin,
      rut_normalizado=EXCLUDED.rut_normalizado,
      sucursal_id=EXCLUDED.sucursal_id,
      persona_id=EXCLUDED.persona_id,
      marca_id=EXCLUDED.marca_id,
      modelo_id=EXCLUDED.modelo_id,
      forum_sucursal_id=EXCLUDED.forum_sucursal_id,
      crm_sucursal_id=EXCLUDED.crm_sucursal_id,
      vin_sucursal_id=EXCLUDED.vin_sucursal_id,
      forum_persona_id=EXCLUDED.forum_persona_id,
      crm_persona_id=EXCLUDED.crm_persona_id,
      forum_marca_id=EXCLUDED.forum_marca_id,
      crm_marca_id=EXCLUDED.crm_marca_id,
      vin_marca_id=EXCLUDED.vin_marca_id,
      forum_modelo_id=EXCLUDED.forum_modelo_id,
      crm_modelo_id=EXCLUDED.crm_modelo_id,
      vin_modelo_id=EXCLUDED.vin_modelo_id,
      forum_fecha_cotizacion=EXCLUDED.forum_fecha_cotizacion,
      crm_created_at=EXCLUDED.crm_created_at,
      crm_assigned_at=EXCLUDED.crm_assigned_at,
      fecha_factura=EXCLUDED.fecha_factura,
      forum_estado=EXCLUDED.forum_estado,
      forum_estado_revision=EXCLUDED.forum_estado_revision,
      crm_estado=EXCLUDED.crm_estado,
      crm_vendido_raw=EXCLUDED.crm_vendido_raw,
      vendido=EXCLUDED.vendido,
      forum_present=EXCLUDED.forum_present,
      crm_present=EXCLUDED.crm_present,
      vin_present=EXCLUDED.vin_present,
      forum_crm_match_status=EXCLUDED.forum_crm_match_status,
      forum_crm_match_method=EXCLUDED.forum_crm_match_method,
      forum_crm_day_gap=EXCLUDED.forum_crm_day_gap,
      crm_vin_match_status=EXCLUDED.crm_vin_match_status,
      crm_vin_match_method=EXCLUDED.crm_vin_match_method,
      crm_forum_match_count=EXCLUDED.crm_forum_match_count,
      identity_status=EXCLUDED.identity_status,
      materialized_at=EXCLUDED.materialized_at
  `, [materializedAt]);
  await queryDb(`DELETE FROM public.${TABLE} WHERE materialized_at < $1::timestamptz`, [materializedAt]);
}

async function validateMaster() {
  const [stats] = await queryDb(`
    WITH latest_crm AS (
      SELECT DISTINCT "ID"::text deal_id FROM public."CRM_Cidef_raw" WHERE coalesce("ID",'')<>''
    )
    SELECT
      COUNT(*)::int total,
      COUNT(DISTINCT commercial_operation_id)::int distinct_operation_ids,
      COUNT(*) FILTER (WHERE operation_status='FORUM_ONLY')::int forum_only,
      COUNT(*) FILTER (WHERE operation_status='CRM_ONLY')::int crm_only,
      COUNT(*) FILTER (WHERE operation_status='FORUM_CRM')::int forum_crm,
      COUNT(*) FILTER (WHERE operation_status='CRM_VIN')::int crm_vin,
      COUNT(*) FILTER (WHERE operation_status='FORUM_CRM_VIN')::int forum_crm_vin,
      COUNT(DISTINCT forum_numero_operacion) FILTER (WHERE forum_present)::int forum_operations,
      COUNT(DISTINCT crm_deal_id) FILTER (WHERE crm_present)::int crm_deals,
      COUNT(*) FILTER (WHERE identity_status='MANY_FORUM_TO_ONE_CRM')::int many_forum_to_one_crm_rows,
      COUNT(*) FILTER (WHERE identity_status='SOURCE_CONFLICT')::int identity_conflicts,
      COUNT(*) FILTER (WHERE forum_crm_match_status='AMBIGUOUS' AND crm_deal_id IS NOT NULL)::int ambiguous_with_attached_crm,
      COUNT(*) FILTER (WHERE vin_present AND (NOT crm_present OR NOT vendido))::int invalid_vin_rows,
      (SELECT COUNT(*)::int FROM public.forum_operacion_canonica_v01) source_forum_operations,
      (SELECT COUNT(*)::int FROM latest_crm) source_crm_deals
    FROM public.${TABLE}
  `);
  const classTotal = Number(stats.forum_only)+Number(stats.crm_only)+Number(stats.forum_crm)+Number(stats.crm_vin)+Number(stats.forum_crm_vin);
  return {
    ...stats,
    class_reconciles: classTotal === Number(stats.total),
    operation_ids_unique: Number(stats.total) === Number(stats.distinct_operation_ids),
    forum_reconciles: Number(stats.forum_operations) === Number(stats.source_forum_operations),
    crm_reconciles: Number(stats.crm_deals) === Number(stats.source_crm_deals),
    ambiguous_not_attached: Number(stats.ambiguous_with_attached_crm) === 0,
    vin_rows_valid: Number(stats.invalid_vin_rows) === 0,
  };
}

export async function run() {
  const startedAt = Date.now();
  const materializedAt = new Date().toISOString();
  await ensureSchema();
  await refreshMaster(materializedAt);
  const validation = await validateMaster();
  const valid = validation.class_reconciles && validation.operation_ids_unique && validation.forum_reconciles && validation.crm_reconciles && validation.ambiguous_not_attached && validation.vin_rows_valid;
  if (!valid) {
    const error = new Error('COMMERCIAL_OPERATION_MASTER_VALIDATION_FAILED');
    error.validation = validation;
    throw error;
  }
  return {
    status: 'refreshed',
    engine: ENGINE,
    version: VERSION,
    table: TABLE,
    grain: 'OBSERVABLE_COMMERCIAL_OPERATION_WITHOUT_INVENTED_COMMON_IDENTITY',
    projection_included: false,
    operation_statuses: ['FORUM_ONLY','CRM_ONLY','FORUM_CRM','CRM_VIN','FORUM_CRM_VIN'],
    validation,
    elapsed_ms: Date.now() - startedAt,
  };
}

export const __test = { consensus3, conflict3, buildSourceSql };
