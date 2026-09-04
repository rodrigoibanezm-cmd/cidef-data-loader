import { customGptDb } from '../custom-gpt/db.js';
import { rvmIdentityResolutionCte, rvmModelAliasCtes } from '../rvm/rvmIdentitySql.js';
import {
  buildTemporalSemantics, coverageRow, identityWarnings, normalizeEnum, outputEnvelope,
  parseCutoff, parseDateRange, parseFilterObject, parseTimeGrain, semanticError,
  temporalWarnings, withChanges,
} from './common.js';

export const ENGINE_NAME = 'rvm_longitudinal_context_v01';
const METRICS = new Set(['MARKET_SIZE', 'ENTITY_VIN', 'MARKET_SHARE', 'RANK']);
const GRAINS = new Set(['TOTAL', 'BRAND', 'MODEL', 'SEGMENT', 'TYPE', 'REGION', 'COMUNA', 'FUEL']);
const DIMENSIONS = new Set(['brand_id', 'brand', 'model_id', 'model', 'segment', 'type', 'region', 'comuna', 'fuel']);
const BREAKDOWNS = new Set([...GRAINS].filter((value) => value !== 'TOTAL'));

export function parseRvmLongitudinalInput(input = {}) {
  const metric = normalizeEnum(input.metric, METRICS, 'INVALID_METRIC');
  const grain = normalizeEnum(input.grain, GRAINS, 'INVALID_GRAIN', 'TOTAL');
  const timeGrain = parseTimeGrain(input.time_grain);
  const filters = parseFilterObject(input.universe_filters ?? input.filters, DIMENSIONS);
  const entity = parseFilterObject(input.entity, DIMENSIONS);
  const breakdown = input.breakdown == null ? null : normalizeEnum(input.breakdown, BREAKDOWNS, 'INVALID_BREAKDOWN');
  if (['ENTITY_VIN', 'MARKET_SHARE', 'RANK'].includes(metric) && Object.keys(entity).length === 0) throw semanticError('ENTITY_REQUIRED');
  if (metric === 'MARKET_SIZE' && Object.keys(entity).length) throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'MARKET_SIZE does not accept entity');
  if (metric === 'RANK') {
    if (grain === 'TOTAL') throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'RANK requires a dimension grain');
    if (breakdown) throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', 'RANK does not support breakdown');
    const keys = { BRAND: ['brand_id', 'brand'], MODEL: ['model_id', 'model'], SEGMENT: ['segment'], TYPE: ['type'], REGION: ['region'], COMUNA: ['comuna'], FUEL: ['fuel'] }[grain];
    if (!keys.some((key) => entity[key]?.length === 1)) throw semanticError('SEMANTICALLY_IMPOSSIBLE_COMBINATION', `RANK entity must identify one ${grain}`);
  }
  return { metric, grain, timeGrain, filters, entity, breakdown, ...parseCutoff(input), ...parseDateRange(input) };
}

const DIMS = Object.freeze({
  BRAND: { key: `CASE r.identity_status WHEN 'RESUELTO' THEN r.brand_id::text WHEN 'AMBIGUO' THEN 'AMBIGUOUS' ELSE 'UNRESOLVED' END`, label: `CASE r.identity_status WHEN 'RESUELTO' THEN ma.nombre_canonico WHEN 'AMBIGUO' THEN 'AMBIGUOUS' ELSE 'UNRESOLVED' END` },
  MODEL: { key: `CASE r.identity_status WHEN 'RESUELTO' THEN r.model_id::text WHEN 'AMBIGUO' THEN 'AMBIGUOUS' ELSE 'UNRESOLVED' END`, label: `CASE r.identity_status WHEN 'RESUELTO' THEN mo.nombre_canonico WHEN 'AMBIGUO' THEN 'AMBIGUOUS' ELSE 'UNRESOLVED' END` },
  SEGMENT: { key: `coalesce(master_norm(r.descripcion_segmento),'UNRESOLVED')`, label: `coalesce(nullif(trim(r.descripcion_segmento),''),'UNRESOLVED')` },
  TYPE: { key: `coalesce(master_norm(r.descripcion_tipo),'UNRESOLVED')`, label: `coalesce(nullif(trim(r.descripcion_tipo),''),'UNRESOLVED')` },
  REGION: { key: `coalesce(master_norm(r.region),'UNRESOLVED')`, label: `coalesce(nullif(trim(r.region),''),'UNRESOLVED')` },
  COMUNA: { key: `coalesce(master_norm(r.comuna_adquisicion),'UNRESOLVED')`, label: `coalesce(nullif(trim(r.comuna_adquisicion),''),'UNRESOLVED')` },
  FUEL: { key: `coalesce(master_norm(r.combustible),'UNRESOLVED')`, label: `coalesce(nullif(trim(r.combustible),''),'UNRESOLVED')` },
});

function add(params, value) { params.push(value); return `$${params.length}`; }
function predicates(filters, params, alias = 'r') {
  const columns = { brand_id: `${alias}.brand_id::text`, brand: 'ma.nombre_canonico', model_id: `${alias}.model_id::text`, model: 'mo.nombre_canonico', segment: `${alias}.descripcion_segmento`, type: `${alias}.descripcion_tipo`, region: `${alias}.region`, comuna: `${alias}.comuna_adquisicion`, fuel: `${alias}.combustible` };
  return Object.entries(filters).map(([key, values]) => {
    const p = add(params, values);
    return key.endsWith('_id') ? `${columns[key]} = ANY(${p}::text[])`
      : `master_norm(${columns[key]}) = ANY(ARRAY(SELECT master_norm(v) FROM unnest(${p}::text[]) v))`;
  });
}

export function buildRvmLongitudinalQuery(parsed) {
  const params = [];
  const dateFrom = add(params, parsed.dateFrom); const dateTo = add(params, parsed.dateTo);
  const cutoff = parsed.cutoffDate ? add(params, parsed.cutoffDate) : 'NULL';
  const universe = predicates(parsed.filters, params);
  const entity = predicates(parsed.entity, params);
  const trunc = parsed.timeGrain === 'YEAR' ? 'year' : 'month';
  const interval = parsed.timeGrain === 'YEAR' ? '1 year' : '1 month';
  const format = parsed.timeGrain === 'YEAR' ? 'YYYY' : 'YYYY-MM';
  const position = parsed.timeGrain === 'YEAR' ? 'extract(doy from r.fecha)::int' : 'extract(day from r.fecha)::int';
  const comparisonExtract = parsed.timeGrain === 'YEAR' ? 'doy' : 'day';
  const bd = parsed.breakdown ? DIMS[parsed.breakdown] : null;
  const grain = parsed.grain === 'TOTAL' ? null : DIMS[parsed.grain];
  const groups = bd
    ? `SELECT period,'TOTAL'::text row_type,NULL::text bucket_key,NULL::text bucket_label,sum(cantidad)::numeric units FROM base GROUP BY period
       UNION ALL SELECT period,'BREAKDOWN',${bd.key},min(${bd.label}),sum(cantidad)::numeric FROM base r LEFT JOIN marcas_master_v01 ma ON ma.marca_id=r.brand_id LEFT JOIN modelos_master_v01 mo ON mo.modelo_id=r.model_id GROUP BY period,${bd.key}`
    : `SELECT period,'TOTAL'::text row_type,NULL::text bucket_key,NULL::text bucket_label,sum(cantidad)::numeric units FROM base GROUP BY period`;
  const entityGroups = bd
    ? `SELECT period,'TOTAL'::text row_type,NULL::text bucket_key,sum(cantidad)::numeric units FROM entity_base GROUP BY period
       UNION ALL SELECT period,'BREAKDOWN',${bd.key},sum(cantidad)::numeric FROM entity_base r LEFT JOIN marcas_master_v01 ma ON ma.marca_id=r.brand_id LEFT JOIN modelos_master_v01 mo ON mo.modelo_id=r.model_id GROUP BY period,${bd.key}`
    : `SELECT period,'TOTAL'::text row_type,NULL::text bucket_key,sum(cantidad)::numeric units FROM entity_base GROUP BY period`;
  let rankCtes = '';
  let valueSql = parsed.metric === 'MARKET_SIZE' ? 'coalesce(d.units,0)'
    : parsed.metric === 'MARKET_SHARE' ? 'CASE WHEN coalesce(d.units,0)=0 THEN NULL ELSE coalesce(n.units,0)/d.units END'
      : 'coalesce(n.units,0)';
  let rankJoin = '';
  if (parsed.metric === 'RANK') {
    const grainKeys = { BRAND: ['brand_id', 'brand'], MODEL: ['model_id', 'model'], SEGMENT: ['segment'], TYPE: ['type'], REGION: ['region'], COMUNA: ['comuna'], FUEL: ['fuel'] }[parsed.grain];
    const chosen = grainKeys.find((key) => parsed.entity[key]?.length === 1);
    const target = add(params, parsed.entity[chosen][0]);
    const match = chosen.endsWith('_id') ? `c.entity_key=${target}::text` : `master_norm(c.entity_label)=master_norm(${target}::text)`;
    rankCtes = `, candidates AS (SELECT period,${grain.key} entity_key,min(${grain.label}) entity_label,sum(cantidad)::numeric units FROM base r LEFT JOIN marcas_master_v01 ma ON ma.marca_id=r.brand_id LEFT JOIN modelos_master_v01 mo ON mo.modelo_id=r.model_id GROUP BY period,${grain.key}), ranked AS (SELECT c.*,dense_rank() OVER(PARTITION BY period ORDER BY units DESC,entity_key)::int rank FROM candidates c), target_rank AS (SELECT * FROM ranked c WHERE ${match})`;
    rankJoin = 'LEFT JOIN target_rank tr ON tr.period=c.period';
    valueSql = 'tr.rank';
  }
  const sameDay = parsed.cutoffMode === 'SAME_DAY' ? `${position} <= a.comparison_day` : 'TRUE';
  const sql = `WITH calendar AS (SELECT to_char(d,'${format}') period FROM generate_series(date_trunc('${trunc}',${dateFrom}::date),date_trunc('${trunc}',${dateTo}::date),'${interval}'::interval) d),
  rvm_scoped AS MATERIALIZED (SELECT r.*,date_trunc('${trunc}',r.fecha)::date bucket,master_norm(r.marca) raw_brand_norm,master_norm(r.modelo_homologado) raw_model_norm,master_norm(r.modeo_version) raw_version_norm FROM rvm_raw r WHERE r.fecha BETWEEN ${dateFrom}::date AND ${dateTo}::date),
  ${rvmModelAliasCtes()}, ${rvmIdentityResolutionCte()},
  resolved AS MATERIALIZED (SELECT i.*,to_char(i.bucket,'${format}') period FROM identity_resolution i),
  universe_base AS MATERIALIZED (SELECT r.* FROM resolved r LEFT JOIN marcas_master_v01 ma ON ma.marca_id=r.brand_id LEFT JOIN modelos_master_v01 mo ON mo.modelo_id=r.model_id${universe.length ? ` WHERE ${universe.join(' AND ')}` : ''}),
  observed AS (SELECT max(fecha)::date last_observed_date FROM universe_base),
  anchor AS (SELECT o.last_observed_date,CASE WHEN o.last_observed_date IS NULL THEN NULL ELSE least(${dateTo}::date,coalesce(${cutoff}::date,${dateTo}::date),o.last_observed_date) END effective_date_to,CASE WHEN '${parsed.cutoffMode}'='SAME_DAY' THEN extract(${comparisonExtract} from coalesce(${cutoff}::date,o.last_observed_date,${dateTo}::date))::int END comparison_day FROM observed o),
  base AS MATERIALIZED (SELECT r.* FROM universe_base r CROSS JOIN anchor a WHERE r.fecha<=a.effective_date_to AND ${sameDay}),
  entity_base AS MATERIALIZED (SELECT r.* FROM base r LEFT JOIN marcas_master_v01 ma ON ma.marca_id=r.brand_id LEFT JOIN modelos_master_v01 mo ON mo.modelo_id=r.model_id${entity.length ? ` WHERE ${entity.join(' AND ')}` : ''}),
  identity_coverage AS (SELECT coalesce(sum(cantidad) FILTER(WHERE identity_status='RESUELTO'),0)::numeric resolved,coalesce(sum(cantidad) FILTER(WHERE identity_status='NO_RESUELTO'),0)::numeric unresolved,coalesce(sum(cantidad) FILTER(WHERE identity_status='AMBIGUO'),0)::numeric ambiguous,coalesce(sum(cantidad),0)::numeric total FROM base),
  denominator AS (${groups}), numerator AS (${entityGroups})${rankCtes}
  SELECT c.period,x.row_type,x.bucket_key,x.bucket_label,coalesce(n.units,0)::numeric numerator,coalesce(d.units,0)::numeric denominator,${valueSql} value,a.last_observed_date,a.effective_date_to,a.comparison_day,i.resolved identity_resolved,i.unresolved identity_unresolved,i.ambiguous identity_ambiguous,i.total identity_total
  FROM calendar c CROSS JOIN (SELECT 'TOTAL'::text row_type,NULL::text bucket_key,NULL::text bucket_label${bd ? ` UNION ALL SELECT DISTINCT 'BREAKDOWN',bucket_key,bucket_label FROM denominator WHERE row_type='BREAKDOWN'` : ''}) x
  LEFT JOIN denominator d ON d.period=c.period AND d.row_type=x.row_type AND d.bucket_key IS NOT DISTINCT FROM x.bucket_key
  LEFT JOIN numerator n ON n.period=c.period AND n.row_type=x.row_type AND n.bucket_key IS NOT DISTINCT FROM x.bucket_key
  ${rankJoin} CROSS JOIN anchor a CROSS JOIN identity_coverage i ORDER BY c.period,x.row_type DESC,x.bucket_key`;
  return { sql, params };
}

export function assembleRvmLongitudinal(parsed, rows) {
  const point = (row) => ({ period: row.period, ...(parsed.metric === 'MARKET_SHARE' ? { numerator: Number(row.numerator), denominator: Number(row.denominator) } : parsed.metric === 'RANK' ? { entityVin: Number(row.numerator), denominator: Number(row.denominator) } : {}), value: row.value == null ? null : Number(row.value) });
  const series = withChanges(rows.filter((row) => row.row_type === 'TOTAL').map(point));
  let seriesByBreakdown = null;
  if (parsed.breakdown) {
    const buckets = new Map();
    for (const row of rows.filter((item) => item.row_type === 'BREAKDOWN')) {
      if (!buckets.has(row.bucket_key)) buckets.set(row.bucket_key, { key: row.bucket_key, label: row.bucket_label, identityStatus: row.bucket_key === 'UNRESOLVED' ? 'UNRESOLVED' : row.bucket_key === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'RESOLVED', series: [] });
      buckets.get(row.bucket_key).series.push(point(row));
    }
    seriesByBreakdown = [...buckets.values()].map((bucket) => ({ ...bucket, series: withChanges(bucket.series) }));
  }
  const first = rows.find((row) => row.row_type === 'TOTAL') || {};
  const temporalSemantics = buildTemporalSemantics(parsed, first.last_observed_date);
  if (first.effective_date_to) temporalSemantics.effectiveDateTo = String(first.effective_date_to).slice(0, 10);
  if (first.comparison_day != null) temporalSemantics.comparisonDay = Number(first.comparison_day);
  const counts = { resolved: first.identity_resolved, unresolved: first.identity_unresolved,
    ambiguous: first.identity_ambiguous, notApplicable: 0, total: first.identity_total };
  const dimensionCoverage = ['BRAND', 'MODEL'].map((dimension) => coverageRow(dimension, counts));
  const warnings = [...temporalWarnings(temporalSemantics), ...identityWarnings(dimensionCoverage)];
  return outputEnvelope({ motor: ENGINE_NAME, domain: 'RVM', parsed, series, seriesByBreakdown,
    temporalSemantics, coverage: { dimensionCoverage }, warnings,
    metadata: { unit: parsed.metric === 'MARKET_SHARE' ? 'RATIO' : parsed.metric === 'RANK' ? 'ORDINAL_RANK' : 'N_RVM_VEHICLES', universeFilters: parsed.filters, entity: parsed.entity, denominatorExplicit: true } });
}

export async function buildRvmLongitudinal(input = {}) {
  const parsed = parseRvmLongitudinalInput(input);
  const query = buildRvmLongitudinalQuery(parsed);
  const rows = await customGptDb().query(query.sql, query.params);
  return assembleRvmLongitudinal(parsed, rows);
}
