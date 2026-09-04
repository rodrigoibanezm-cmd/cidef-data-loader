import { customGptDb } from '../custom-gpt/db.js';
import { VENDEDOR_CIDEF_INTERVALS_SQL } from '../ventas-org/vendedorCidefSql.js';
import {
  buildTemporalSemantics, coverageRow, identityWarnings, normalizeEnum, outputEnvelope,
  parseCutoff, parseDateRange, parseFilterObject, parseTimeGrain, semanticError,
  temporalWarnings, withChanges,
} from './common.js';

export const ENGINE_NAME = 'crm_longitudinal_context_v01';
const METRICS = new Set(['LEADS_CREATED', 'SOLD', 'NOT_SOLD', 'MANAGED', 'UNMANAGED',
  'MANAGEMENT_COVERAGE', 'CONVERSION_ON_MANAGED', 'IN_MANAGEMENT', 'OPPORTUNITY',
  'CLOSED', 'DESISTED', 'CONVERSION_RATE']);
const GRAINS = new Set(['TOTAL', 'BRAND', 'PRODUCT_INTEREST', 'ORIGIN', 'SUBORIGIN',
  'STATUS', 'STORE', 'SELLER', 'INTEREST_LEVEL', 'DESIST_REASON']);
const DIMENSIONS = new Set(['brand', 'product_interest', 'origin', 'suborigin', 'status',
  'store_id', 'store', 'store_raw', 'seller_id', 'seller', 'seller_raw', 'interest_level',
  'desist_reason']);
const DATE_AXES = new Set(['CREATED_AT', 'ASSIGNED_AT', 'MANAGED_AT', 'DESISTED_AT']);
const MODES = new Set(['EVENT', 'COHORT']);
const BREAKDOWNS = new Set([...GRAINS].filter((value) => value !== 'TOTAL'));

export function parseCrmLongitudinalInput(input = {}) {
  if ((input.mode && String(input.mode).toUpperCase() === 'SNAPSHOT') || input.as_of != null) {
    throw semanticError('UNSUPPORTED_TEMPORAL_RECONSTRUCTION', 'CRM_Cidef_raw does not preserve historical state transitions');
  }
  const metric = normalizeEnum(input.metric, METRICS, 'INVALID_METRIC');
  const grain = normalizeEnum(input.grain, GRAINS, 'INVALID_GRAIN', 'TOTAL');
  const mode = normalizeEnum(input.mode, MODES, 'INVALID_MODE', ['LEADS_CREATED', 'MANAGED', 'DESISTED'].includes(metric) ? 'EVENT' : 'COHORT');
  const axisInput = mode === 'COHORT' ? input.cohort_axis ?? input.date_axis : input.date_axis;
  const dateAxis = normalizeEnum(axisInput, DATE_AXES, 'INVALID_DATE_AXIS');
  const eventAxis = { LEADS_CREATED: 'CREATED_AT', MANAGED: 'MANAGED_AT', DESISTED: 'DESISTED_AT' }[metric];
  if (mode === 'EVENT' && (!eventAxis || dateAxis !== eventAxis)) {
    if (!eventAxis) throw semanticError('UNSUPPORTED_TEMPORAL_RECONSTRUCTION', 'status outcomes require mode=COHORT');
    throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', `${metric} event requires ${eventAxis}`);
  }
  const filters = parseFilterObject(input.filters, DIMENSIONS);
  const breakdown = input.breakdown == null ? null : normalizeEnum(input.breakdown, BREAKDOWNS, 'INVALID_BREAKDOWN');
  return {
    metric, grain, mode, dateAxis, timeGrain: parseTimeGrain(input.time_grain), filters,
    breakdown, ...parseCutoff(input), ...parseDateRange(input),
  };
}

const RAW = Object.freeze({
  brand: '"Marca"', product_interest: '"Producto de interes"', origin: '"Origen"',
  suborigin: '"Suborigen"', status: '"Estado"', store_raw: '"Sucursal Asignada"',
  seller_raw: '"Asignado a"', interest_level: '"Grado de Interes"',
  desist_reason: '"Motivo desistido"',
});
const GRAIN_KEY = Object.freeze({ BRAND: 'brand', PRODUCT_INTEREST: 'product_interest',
  ORIGIN: 'origin', SUBORIGIN: 'suborigin', STATUS: 'status', STORE: 'store', SELLER: 'seller',
  INTEREST_LEVEL: 'interest_level', DESIST_REASON: 'desist_reason' });
const AXIS_COLUMN = Object.freeze({ CREATED_AT: '"Creado el"', ASSIGNED_AT: '"Asignado el"',
  MANAGED_AT: '"Gestionado el"', DESISTED_AT: '"Desistido el"' });

function dateExpression(column) {
  return `CASE
    WHEN nullif(trim(${column}),'') IS NULL THEN NULL
    WHEN trim(${column}) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN to_date(substring(trim(${column}) from 1 for 10),'YYYY-MM-DD')
    WHEN trim(${column}) ~ '^\\d{2}/\\d{2}/\\d{4}' THEN to_date(substring(trim(${column}) from 1 for 10),'DD/MM/YYYY')
    WHEN trim(${column}) ~ '^\\d{2}-\\d{2}-\\d{4}' THEN to_date(substring(trim(${column}) from 1 for 10),'DD-MM-YYYY')
    ELSE NULL END`;
}
function add(params, value) { params.push(value); return `$${params.length}`; }
function filterSql(filters, params) {
  const columns = {
    ...RAW, store_id: 'e.sucursal_id::text', store: 'e.sucursal_nombre',
    seller_id: 'e.persona_id::text', seller: 'e.persona_nombre',
  };
  return Object.entries(filters).map(([key, values]) => {
    const p = add(params, values);
    return key.endsWith('_id') ? `${columns[key]} = ANY(${p}::text[])`
      : `master_norm(${columns[key]}) = ANY(ARRAY(SELECT master_norm(v) FROM unnest(${p}::text[]) v))`;
  });
}

function metricExpressions(metric) {
  const status = 'master_norm("Estado")';
  const sold = `master_norm("Vendido") = ANY(ARRAY['SI','S','YES','TRUE','1'])`;
  const notSold = `master_norm("Vendido") = ANY(ARRAY['NO','N','FALSE','0'])`;
  const managed = 'managed_date IS NOT NULL';
  return {
    LEADS_CREATED: ['TRUE', 'TRUE'], SOLD: [sold, 'TRUE'], NOT_SOLD: [notSold, 'TRUE'],
    MANAGED: [managed, 'TRUE'], UNMANAGED: [`NOT (${managed})`, 'TRUE'],
    MANAGEMENT_COVERAGE: [managed, 'TRUE'], CONVERSION_ON_MANAGED: [`(${sold}) AND ${managed}`, managed],
    IN_MANAGEMENT: [`${status}='EN GESTION'`, 'TRUE'], OPPORTUNITY: [`${status}='OPORTUNIDAD'`, 'TRUE'],
    CLOSED: [`${status}='CERRADO'`, 'TRUE'],
    DESISTED: [`(${status}='DESISTIDO' OR desist_date IS NOT NULL)`, 'TRUE'],
    CONVERSION_RATE: [sold, 'TRUE'],
  }[metric];
}

function identityDimension(grain) {
  if (grain === 'STORE') return {
    key: `CASE WHEN store_raw_norm IS NULL THEN 'NOT_APPLICABLE' WHEN store_match_count>1 THEN 'AMBIGUOUS' WHEN sucursal_id IS NULL THEN 'UNRESOLVED' ELSE sucursal_id::text END`,
    label: `CASE WHEN store_raw_norm IS NULL THEN 'NOT_APPLICABLE' WHEN store_match_count>1 THEN 'AMBIGUOUS' WHEN sucursal_id IS NULL THEN 'UNRESOLVED' ELSE sucursal_nombre END`,
    status: `CASE WHEN store_raw_norm IS NULL THEN 'NOT_APPLICABLE' WHEN store_match_count>1 THEN 'AMBIGUOUS' WHEN sucursal_id IS NULL THEN 'UNRESOLVED' ELSE 'RESOLVED' END`, raw: 'store_raw',
  };
  if (grain === 'SELLER') return {
    key: `CASE WHEN seller_raw_norm IS NULL THEN 'NOT_APPLICABLE' WHEN seller_match_count>1 THEN 'AMBIGUOUS' WHEN persona_id IS NULL THEN 'UNRESOLVED' WHEN NOT eligible_vendedor_cidef THEN 'NOT_APPLICABLE' ELSE persona_id::text END`,
    label: `CASE WHEN seller_raw_norm IS NULL THEN 'NOT_APPLICABLE' WHEN seller_match_count>1 THEN 'AMBIGUOUS' WHEN persona_id IS NULL THEN 'UNRESOLVED' WHEN NOT eligible_vendedor_cidef THEN 'NOT_APPLICABLE' ELSE persona_nombre END`,
    status: `CASE WHEN seller_raw_norm IS NULL THEN 'NOT_APPLICABLE' WHEN seller_match_count>1 THEN 'AMBIGUOUS' WHEN persona_id IS NULL THEN 'UNRESOLVED' WHEN NOT eligible_vendedor_cidef THEN 'NOT_APPLICABLE' ELSE 'RESOLVED' END`, raw: 'seller_raw',
  };
  const raw = RAW[GRAIN_KEY[grain]];
  return { key: `coalesce(master_norm(${raw}),'UNRESOLVED')`, label: `coalesce(nullif(trim(${raw}),''),'UNRESOLVED')`, status: `CASE WHEN master_norm(${raw}) IS NULL THEN 'UNRESOLVED' ELSE 'RAW' END`, raw };
}

export function buildCrmLongitudinalQuery(parsed) {
  const params = [];
  const from = add(params, parsed.dateFrom); const to = add(params, parsed.dateTo);
  const cutoff = parsed.cutoffDate ? add(params, parsed.cutoffDate) : 'NULL';
  const filters = filterSql(parsed.filters, params);
  const trunc = parsed.timeGrain === 'YEAR' ? 'year' : 'month';
  const interval = parsed.timeGrain === 'YEAR' ? '1 year' : '1 month';
  const format = parsed.timeGrain === 'YEAR' ? 'YYYY' : 'YYYY-MM';
  const position = parsed.timeGrain === 'YEAR' ? 'extract(doy from event_date)::int' : 'extract(day from event_date)::int';
  const axis = AXIS_COLUMN[parsed.dateAxis];
  const bd = parsed.breakdown ? identityDimension(parsed.breakdown) : null;
  const [numeratorPredicate, denominatorPredicate] = metricExpressions(parsed.metric);
  const ratio = ['CONVERSION_RATE', 'MANAGEMENT_COVERAGE', 'CONVERSION_ON_MANAGED'].includes(parsed.metric);
  const aggregate = (rowType, key = 'NULL::text', label = 'NULL::text', status = 'NULL::text', raw = 'NULL::text') =>
    `SELECT period,'${rowType}'::text row_type,${key} bucket_key,min(${label}) bucket_label,min(${status}) identity_status,array_remove(array_agg(DISTINCT nullif(trim(${raw}),'')),NULL) raw_values,count(*) FILTER(WHERE ${numeratorPredicate})::numeric numerator,count(*) FILTER(WHERE ${denominatorPredicate})::numeric denominator FROM scoped GROUP BY period${rowType === 'BREAKDOWN' ? `,${key}` : ''}`;
  const groups = bd ? `${aggregate('TOTAL')} UNION ALL ${aggregate('BREAKDOWN', bd.key, bd.label, bd.status, bd.raw)}` : aggregate('TOTAL');
  const value = ratio ? 'CASE WHEN coalesce(g.denominator,0)=0 THEN NULL ELSE g.numerator/g.denominator END' : 'coalesce(g.numerator,0)';
  const vendedorCidefSql = VENDEDOR_CIDEF_INTERVALS_SQL.trim().replace(/;$/, '');
  const sameDay = parsed.cutoffMode === 'SAME_DAY' ? `${position} <= a.comparison_day` : 'TRUE';
  const comparisonExtract = parsed.timeGrain === 'YEAR' ? 'doy' : 'day';
  const sql = `WITH dedup AS MATERIALIZED (
    SELECT * FROM (SELECT c.*,row_number() OVER(PARTITION BY coalesce(nullif(trim("ID"),''),ctid::text) ORDER BY ${dateExpression('"loaded_at"')} DESC NULLS LAST,ctid DESC) rn FROM "CRM_Cidef_raw" c) x WHERE rn=1),
  store_candidates AS MATERIALIZED (SELECT master_norm(a.valor_raw) norm,a.sucursal_id FROM sucursal_aliases a WHERE a.validated AND a.sucursal_id IS NOT NULL UNION SELECT master_norm(s.nombre_canonico),s.sucursal_id FROM sucursales_master s),
  store_map AS MATERIALIZED (SELECT norm,min(sucursal_id) sucursal_id,count(DISTINCT sucursal_id)::int match_count FROM store_candidates WHERE norm IS NOT NULL GROUP BY norm),
  seller_candidates AS MATERIALIZED (SELECT master_norm(a.valor_raw) norm,a.persona_id FROM persona_aliases a WHERE a.validated AND a.persona_id IS NOT NULL UNION SELECT master_norm(p.nombre_canonico),p.persona_id FROM personas_master p WHERE p.nombre_canonico IS NOT NULL UNION SELECT master_norm(p.usuario_canonico),p.persona_id FROM personas_master p),
  seller_map AS MATERIALIZED (SELECT norm,min(persona_id) persona_id,count(DISTINCT persona_id)::int match_count FROM seller_candidates WHERE norm IS NOT NULL GROUP BY norm),
  vendedor_cidef AS MATERIALIZED (${vendedorCidefSql}),
  dated AS MATERIALIZED (SELECT d.*,${dateExpression(axis)} event_date,${dateExpression('"Gestionado el"')} managed_date,${dateExpression('"Desistido el"')} desist_date,master_norm("Sucursal Asignada") store_raw_norm,master_norm("Asignado a") seller_raw_norm,"Sucursal Asignada" store_raw,"Asignado a" seller_raw FROM dedup d),
  enriched AS MATERIALIZED (SELECT d.*,sm.match_count store_match_count,CASE WHEN sm.match_count=1 THEN sm.sucursal_id END sucursal_id,ss.nombre_canonico sucursal_nombre,ss.tipo_canal,pm.match_count seller_match_count,CASE WHEN pm.match_count=1 THEN pm.persona_id END persona_id,pp.nombre_canonico persona_nombre,
    CASE WHEN sm.match_count=1 AND pm.match_count=1 AND ss.tipo_canal='CIDEF' AND EXISTS (SELECT 1 FROM vendedor_cidef vc WHERE vc.persona_id=pm.persona_id AND vc.sucursal_id=sm.sucursal_id AND event_date BETWEEN coalesce(vc.valid_from,'-infinity'::date) AND coalesce(vc.valid_to,'infinity'::date) AND (vc.vigente OR vc.valid_from IS NOT NULL OR vc.valid_to IS NOT NULL)) THEN true ELSE false END eligible_vendedor_cidef
    FROM dated d LEFT JOIN store_map sm ON sm.norm=d.store_raw_norm LEFT JOIN sucursales_master ss ON ss.sucursal_id=sm.sucursal_id AND sm.match_count=1 LEFT JOIN seller_map pm ON pm.norm=d.seller_raw_norm LEFT JOIN personas_master pp ON pp.persona_id=pm.persona_id AND pm.match_count=1),
  filtered AS MATERIALIZED (SELECT e.* FROM enriched e WHERE ${filters.length ? filters.join(' AND ') : 'TRUE'}),
  observed AS (SELECT max(event_date)::date last_observed_date FROM filtered WHERE event_date BETWEEN ${from}::date AND ${to}::date),
  anchor AS (SELECT o.last_observed_date,CASE WHEN o.last_observed_date IS NULL THEN NULL ELSE least(${to}::date,coalesce(${cutoff}::date,${to}::date),o.last_observed_date) END effective_date_to,CASE WHEN '${parsed.cutoffMode}'='SAME_DAY' THEN extract(${comparisonExtract} from coalesce(${cutoff}::date,o.last_observed_date,${to}::date))::int END comparison_day FROM observed o),
  scoped AS MATERIALIZED (SELECT f.*,to_char(date_trunc('${trunc}',event_date),'${format}') period FROM filtered f CROSS JOIN anchor a WHERE event_date BETWEEN ${from}::date AND a.effective_date_to AND ${sameDay}),
  calendar AS (SELECT to_char(d,'${format}') period FROM generate_series(date_trunc('${trunc}',${from}::date),date_trunc('${trunc}',${to}::date),'${interval}'::interval) d),
  grouped AS (${groups}),
  axis_coverage AS (SELECT count(*)::bigint source_records,count(*) FILTER(WHERE event_date IS NOT NULL)::bigint valid_axis_records,count(*) FILTER(WHERE event_date IS NULL)::bigint missing_or_invalid_axis_records,count(*) FILTER(WHERE nullif(trim("Gestionado el"),'') IS NOT NULL AND managed_date IS NULL)::bigint invalid_managed_date_records FROM filtered),
  identity_coverage AS (SELECT count(*) FILTER(WHERE store_raw_norm IS NOT NULL AND store_match_count=1)::bigint store_resolved,count(*) FILTER(WHERE store_raw_norm IS NOT NULL AND store_match_count IS NULL)::bigint store_unresolved,count(*) FILTER(WHERE store_match_count>1)::bigint store_ambiguous,count(*) FILTER(WHERE store_raw_norm IS NULL)::bigint store_not_applicable,count(*) FILTER(WHERE seller_raw_norm IS NOT NULL AND seller_match_count=1 AND eligible_vendedor_cidef)::bigint seller_resolved,count(*) FILTER(WHERE seller_raw_norm IS NOT NULL AND seller_match_count IS NULL)::bigint seller_unresolved,count(*) FILTER(WHERE seller_match_count>1)::bigint seller_ambiguous,count(*) FILTER(WHERE seller_raw_norm IS NULL OR (seller_match_count=1 AND NOT eligible_vendedor_cidef))::bigint seller_not_applicable,count(*)::bigint identity_total FROM scoped)
  SELECT c.period,x.row_type,x.bucket_key,x.bucket_label,x.identity_status,x.raw_values,coalesce(g.numerator,0)::numeric numerator,coalesce(g.denominator,0)::numeric denominator,${value} value,a.last_observed_date,a.effective_date_to,a.comparison_day,v.*,i.*
  FROM calendar c CROSS JOIN (SELECT 'TOTAL'::text row_type,NULL::text bucket_key,NULL::text bucket_label,NULL::text identity_status,ARRAY[]::text[] raw_values${bd ? ` UNION ALL SELECT 'BREAKDOWN',bucket_key,min(bucket_label),min(identity_status),array_remove(array_agg(DISTINCT raw_value),NULL) FROM grouped LEFT JOIN LATERAL unnest(raw_values) raw_value ON true WHERE row_type='BREAKDOWN' GROUP BY bucket_key` : ''}) x
  LEFT JOIN grouped g ON g.period=c.period AND g.row_type=x.row_type AND g.bucket_key IS NOT DISTINCT FROM x.bucket_key CROSS JOIN anchor a CROSS JOIN axis_coverage v CROSS JOIN identity_coverage i
  ORDER BY c.period,x.row_type DESC,x.bucket_key`;
  return { sql, params };
}

export function assembleCrmLongitudinal(parsed, rows) {
  const ratio = ['CONVERSION_RATE', 'MANAGEMENT_COVERAGE', 'CONVERSION_ON_MANAGED'].includes(parsed.metric);
  const point = (row) => ({ period: row.period, ...(ratio ? { numerator: Number(row.numerator), denominator: Number(row.denominator) } : {}), value: row.value == null ? null : Number(row.value) });
  const totalRows = rows.filter((row) => row.row_type === 'TOTAL');
  const series = withChanges(totalRows.map(point));
  let seriesByBreakdown = null;
  if (parsed.breakdown) {
    const buckets = new Map();
    for (const row of rows.filter((item) => item.row_type === 'BREAKDOWN')) {
      if (!buckets.has(row.bucket_key)) buckets.set(row.bucket_key, { key: row.bucket_key, label: row.bucket_label, identityStatus: row.identity_status || (row.bucket_key === 'UNRESOLVED' ? 'UNRESOLVED' : 'RAW'), rawValues: row.raw_values || [], series: [] });
      buckets.get(row.bucket_key).series.push(point(row));
    }
    seriesByBreakdown = [...buckets.values()].map((bucket) => ({ ...bucket, series: withChanges(bucket.series) }));
  }
  const first = totalRows[0] || {};
  const temporalSemantics = buildTemporalSemantics(parsed, first.last_observed_date);
  const total = Number(first.identity_total || 0);
  const dimensionCoverage = ['STORE', 'SELLER'].map((dimension) => coverageRow(dimension, {
    resolved: first[`${dimension.toLowerCase()}_resolved`], unresolved: first[`${dimension.toLowerCase()}_unresolved`], ambiguous: first[`${dimension.toLowerCase()}_ambiguous`], notApplicable: first[`${dimension.toLowerCase()}_not_applicable`], total,
  }));
  const eventDateCoverage = { sourceRecords: Number(first.source_records || 0), validAxisRecords: Number(first.valid_axis_records || 0), missingOrInvalidAxisRecords: Number(first.missing_or_invalid_axis_records || 0), invalidManagedDateRecords: Number(first.invalid_managed_date_records || 0) };
  const warnings = [...temporalWarnings(temporalSemantics), ...identityWarnings(dimensionCoverage), 'CRM_NO_HISTORICAL_STATE_SNAPSHOTS'];
  if (eventDateCoverage.missingOrInvalidAxisRecords > 0) warnings.push('CRM_MISSING_OR_INVALID_EVENT_DATE_PRESENT');
  if (eventDateCoverage.invalidManagedDateRecords > 0) warnings.push('CRM_INVALID_MANAGED_DATE_PRESENT');
  return outputEnvelope({ motor: ENGINE_NAME, domain: 'CRM', parsed, series, seriesByBreakdown, temporalSemantics, coverage: { dimensionCoverage, eventDateCoverage }, warnings, metadata: {
    mode: parsed.mode, dateAxis: parsed.dateAxis, cohortAxis: parsed.mode === 'COHORT' ? parsed.dateAxis : null,
    identity: { PRODUCT_INTEREST: 'RAW', STORE: 'MASTER_EXACT', SELLER: 'MASTER_EXACT_AND_VENDEDOR_CIDEF' },
    recordPolicy: 'latest loaded row per non-empty CRM ID; null IDs remain separate',
    managementDefinitions: { managed: 'Gestionado el parses to a valid date', unmanaged: 'Gestionado el does not parse to a valid date', managementCoverage: 'MANAGED / (MANAGED + UNMANAGED)', conversionOnManaged: 'Vendido affirmative AND MANAGED / MANAGED' },
    sellerPolicy: `VENDEDOR_CIDEF at the selected ${parsed.dateAxis} event date and resolved CIDEF store`, limitation: 'No historical state snapshot reconstruction',
  } });
}

export async function buildCrmLongitudinal(input = {}) {
  const parsed = parseCrmLongitudinalInput(input);
  const query = buildCrmLongitudinalQuery(parsed);
  return assembleCrmLongitudinal(parsed, await customGptDb().query(query.sql, query.params));
}
