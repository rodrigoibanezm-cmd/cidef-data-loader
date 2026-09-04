import { customGptDb } from '../custom-gpt/db.js';
import {
  normalizeEnum, outputEnvelope, parseDateRange, parseFilterObject, parseTimeGrain,
  semanticError, withChanges,
} from './common.js';

export const ENGINE_NAME = 'crm_longitudinal_context_v01';
const METRICS = new Set(['LEADS_CREATED', 'SOLD', 'NOT_SOLD', 'UNMANAGED', 'IN_MANAGEMENT', 'OPPORTUNITY', 'CLOSED', 'DESISTED', 'CONVERSION_RATE']);
const GRAINS = new Set(['TOTAL', 'BRAND', 'PRODUCT_INTEREST', 'ORIGIN', 'SUBORIGIN', 'STATUS', 'STORE', 'SELLER', 'INTEREST_LEVEL', 'DESIST_REASON']);
const DIMENSIONS = new Set(['brand', 'product_interest', 'origin', 'suborigin', 'status', 'store_raw', 'seller_raw', 'interest_level', 'desist_reason']);
const DATE_AXES = new Set(['CREATED_AT', 'ASSIGNED_AT', 'MANAGED_AT', 'DESISTED_AT']);
const MODES = new Set(['EVENT', 'COHORT']);
const BREAKDOWNS = new Set([...GRAINS].filter((value) => value !== 'TOTAL'));

export function parseCrmLongitudinalInput(input = {}) {
  if (input.mode && String(input.mode).toUpperCase() === 'SNAPSHOT' || input.as_of != null) {
    throw semanticError('UNSUPPORTED_TEMPORAL_RECONSTRUCTION', 'CRM_Cidef_raw does not preserve historical state transitions');
  }
  const metric = normalizeEnum(input.metric, METRICS, 'INVALID_METRIC');
  const grain = normalizeEnum(input.grain, GRAINS, 'INVALID_GRAIN', 'TOTAL');
  const mode = normalizeEnum(input.mode, MODES, 'INVALID_MODE', ['LEADS_CREATED', 'DESISTED'].includes(metric) ? 'EVENT' : 'COHORT');
  const axisInput = mode === 'COHORT' ? input.cohort_axis ?? input.date_axis : input.date_axis;
  const dateAxis = normalizeEnum(axisInput, DATE_AXES, 'INVALID_DATE_AXIS');
  if (mode === 'EVENT' && metric === 'LEADS_CREATED' && dateAxis !== 'CREATED_AT') throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'LEADS_CREATED event requires CREATED_AT');
  if (mode === 'EVENT' && metric === 'DESISTED' && dateAxis !== 'DESISTED_AT') throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'DESISTED event requires DESISTED_AT');
  if (mode === 'EVENT' && !['LEADS_CREATED', 'DESISTED'].includes(metric)) throw semanticError('UNSUPPORTED_TEMPORAL_RECONSTRUCTION', 'status outcomes require mode=COHORT');
  const filters = parseFilterObject(input.filters, DIMENSIONS);
  const breakdown = input.breakdown == null ? null : normalizeEnum(input.breakdown, BREAKDOWNS, 'INVALID_BREAKDOWN');
  return { metric, grain, mode, dateAxis, timeGrain: parseTimeGrain(input.time_grain), filters, breakdown, ...parseDateRange(input) };
}

const RAW = Object.freeze({
  brand: '"Marca"', product_interest: '"Producto de interes"', origin: '"Origen"', suborigin: '"Suborigen"',
  status: '"Estado"', store_raw: '"Sucursal Asignada"', seller_raw: '"Asignado a"',
  interest_level: '"Grado de Interes"', desist_reason: '"Motivo desistido"',
});
const GRAIN_KEY = Object.freeze({ BRAND: 'brand', PRODUCT_INTEREST: 'product_interest', ORIGIN: 'origin', SUBORIGIN: 'suborigin', STATUS: 'status', STORE: 'store_raw', SELLER: 'seller_raw', INTEREST_LEVEL: 'interest_level', DESIST_REASON: 'desist_reason' });
const AXIS_COLUMN = Object.freeze({ CREATED_AT: '"Creado el"', ASSIGNED_AT: '"Asignado el"', MANAGED_AT: '"Gestionado el"', DESISTED_AT: '"Desistido el"' });

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
  return Object.entries(filters).map(([key, values]) => {
    const p = add(params, values);
    return `master_norm(${RAW[key]}) = ANY(ARRAY(SELECT master_norm(v) FROM unnest(${p}::text[]) v))`;
  });
}
function outcome(metric) {
  const status = `master_norm("Estado")`;
  const sold = `master_norm("Vendido")`;
  return {
    LEADS_CREATED: 'TRUE', SOLD: `${sold} = ANY(ARRAY['SI','S','YES','TRUE','1'])`,
    NOT_SOLD: `${sold} = ANY(ARRAY['NO','N','FALSE','0'])`, UNMANAGED: `${status}='SIN GESTION'`,
    IN_MANAGEMENT: `${status}='EN GESTION'`, OPPORTUNITY: `${status}='OPORTUNIDAD'`,
    CLOSED: `${status}='CERRADO'`, DESISTED: `(${status}='DESISTIDO' OR event_date IS NOT NULL)`,
    CONVERSION_RATE: `${sold} = ANY(ARRAY['SI','S','YES','TRUE','1'])`,
  }[metric];
}

export function buildCrmLongitudinalQuery(parsed) {
  const params = [];
  const from = add(params, parsed.dateFrom); const to = add(params, parsed.dateTo);
  const filters = filterSql(parsed.filters, params);
  const trunc = parsed.timeGrain === 'YEAR' ? 'year' : 'month';
  const interval = parsed.timeGrain === 'YEAR' ? '1 year' : '1 month';
  const format = parsed.timeGrain === 'YEAR' ? 'YYYY' : 'YYYY-MM';
  const axis = AXIS_COLUMN[parsed.dateAxis];
  const bdKey = parsed.breakdown ? GRAIN_KEY[parsed.breakdown] : null;
  const bdColumn = bdKey ? RAW[bdKey] : null;
  const groups = bdColumn ? `SELECT period,'TOTAL'::text row_type,NULL::text bucket_key,NULL::text bucket_label,count(*) FILTER(WHERE ${outcome(parsed.metric)})::numeric numerator,count(*)::numeric denominator FROM scoped GROUP BY period
    UNION ALL SELECT period,'BREAKDOWN',coalesce(master_norm(${bdColumn}),'UNRESOLVED'),coalesce(min(nullif(trim(${bdColumn}),'')),'UNRESOLVED'),count(*) FILTER(WHERE ${outcome(parsed.metric)})::numeric,count(*)::numeric FROM scoped GROUP BY period,coalesce(master_norm(${bdColumn}),'UNRESOLVED')`
    : `SELECT period,'TOTAL'::text row_type,NULL::text bucket_key,NULL::text bucket_label,count(*) FILTER(WHERE ${outcome(parsed.metric)})::numeric numerator,count(*)::numeric denominator FROM scoped GROUP BY period`;
  const value = parsed.metric === 'CONVERSION_RATE'
    ? `CASE WHEN coalesce(g.denominator,0)=0 THEN NULL ELSE g.numerator/g.denominator END`
    : 'coalesce(g.numerator,0)';
  const sql = `WITH dedup AS MATERIALIZED (
    SELECT * FROM (SELECT c.*,row_number() OVER(PARTITION BY coalesce(nullif(trim("ID"),''),ctid::text) ORDER BY ${dateExpression('"loaded_at"')} DESC NULLS LAST,ctid DESC) rn FROM "CRM_Cidef_raw" c) x WHERE rn=1),
  dated AS MATERIALIZED (SELECT d.*,${dateExpression(axis)} event_date FROM dedup d),
  filtered AS MATERIALIZED (SELECT * FROM dated WHERE ${filters.length ? filters.join(' AND ') : 'TRUE'}),
  scoped AS MATERIALIZED (SELECT f.*,to_char(date_trunc('${trunc}',event_date),'${format}') period FROM filtered f WHERE event_date BETWEEN ${from}::date AND ${to}::date),
  calendar AS (SELECT to_char(d,'${format}') period FROM generate_series(date_trunc('${trunc}',${from}::date),date_trunc('${trunc}',${to}::date),'${interval}'::interval) d),
  grouped AS (${groups}), coverage AS (SELECT count(*)::bigint source_records,count(*) FILTER(WHERE event_date IS NOT NULL)::bigint valid_axis_records,count(*) FILTER(WHERE event_date IS NULL)::bigint missing_or_invalid_axis_records FROM filtered)
  SELECT c.period,x.row_type,x.bucket_key,x.bucket_label,coalesce(g.numerator,0)::numeric numerator,coalesce(g.denominator,0)::numeric denominator,${value} value,v.source_records,v.valid_axis_records,v.missing_or_invalid_axis_records
  FROM calendar c CROSS JOIN (SELECT 'TOTAL'::text row_type,NULL::text bucket_key,NULL::text bucket_label${bdColumn ? ` UNION ALL SELECT DISTINCT 'BREAKDOWN',bucket_key,bucket_label FROM grouped WHERE row_type='BREAKDOWN'` : ''}) x
  LEFT JOIN grouped g ON g.period=c.period AND g.row_type=x.row_type AND g.bucket_key IS NOT DISTINCT FROM x.bucket_key CROSS JOIN coverage v
  ORDER BY c.period,x.row_type DESC,x.bucket_key`;
  return { sql, params };
}

export function assembleCrmLongitudinal(parsed, rows) {
  const point = (row) => ({ period: row.period, ...(parsed.metric === 'CONVERSION_RATE' ? { numerator: Number(row.numerator), denominator: Number(row.denominator) } : {}), value: row.value == null ? null : Number(row.value) });
  const totalRows = rows.filter((row) => row.row_type === 'TOTAL');
  const series = withChanges(totalRows.map(point));
  let seriesByBreakdown = null;
  if (parsed.breakdown) {
    const buckets = new Map();
    for (const row of rows.filter((item) => item.row_type === 'BREAKDOWN')) {
      if (!buckets.has(row.bucket_key)) buckets.set(row.bucket_key, { key: row.bucket_key, label: row.bucket_label, identityStatus: row.bucket_key === 'UNRESOLVED' ? 'UNRESOLVED' : 'RAW', series: [] });
      buckets.get(row.bucket_key).series.push(point(row));
    }
    seriesByBreakdown = [...buckets.values()].map((bucket) => ({ ...bucket, series: withChanges(bucket.series) }));
  }
  const coverage = totalRows[0] ? { sourceRecords: Number(totalRows[0].source_records), validAxisRecords: Number(totalRows[0].valid_axis_records), missingOrInvalidAxisRecords: Number(totalRows[0].missing_or_invalid_axis_records) } : {};
  return outputEnvelope({ motor: ENGINE_NAME, domain: 'CRM', parsed, series, seriesByBreakdown, metadata: {
    mode: parsed.mode, dateAxis: parsed.dateAxis, cohortAxis: parsed.mode === 'COHORT' ? parsed.dateAxis : null,
    identity: { PRODUCT_INTEREST: 'RAW', STORE: 'RAW', SELLER: 'RAW' },
    recordPolicy: 'latest loaded row per non-empty CRM ID; null IDs remain separate', coverage,
    limitation: 'No historical state snapshot reconstruction',
  } });
}

export async function buildCrmLongitudinal(input = {}) {
  const parsed = parseCrmLongitudinalInput(input);
  const query = buildCrmLongitudinalQuery(parsed);
  return assembleCrmLongitudinal(parsed, await customGptDb().query(query.sql, query.params));
}
