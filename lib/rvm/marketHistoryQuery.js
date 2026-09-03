import { rvmIdentityResolutionCte, rvmModelAliasCtes } from './rvmIdentitySql.js';

function addParam(params, value) { params.push(value); return `$${params.length}`; }
function normalizedFilter(params, column, value) {
  if (!value) return '';
  const p = addParam(params, value);
  return ` AND master_norm(r.${column}) = master_norm(${p}::text)`;
}
function geographyFilter(params, geography) {
  if (!geography) return '';
  const p = addParam(params, geography.values);
  return ` AND master_norm(r.${geography.column}) = ANY(ARRAY(SELECT master_norm(g.value) FROM unnest(${p}::text[]) AS g(value)))`;
}
function rawDimension(breakdown) {
  return { SEGMENT: ['segment_key','descripcion_segmento'], TYPE: ['type_key','descripcion_tipo'], FUEL: ['fuel_key','combustible'], REGION: ['region_key','region'], COMUNA: ['comuna_key','comuna_adquisicion'] }[breakdown] || null;
}

export function buildMarketHistoryQuery(scope) {
  const params = [];
  const grain = scope.timeGrain === 'YEAR' ? 'year' : 'month';
  const filters = [
    normalizedFilter(params, 'descripcion_segmento', scope.universe.segment),
    normalizedFilter(params, 'descripcion_tipo', scope.universe.type),
    normalizedFilter(params, 'combustible', scope.universe.fuel),
    geographyFilter(params, scope.universe.geography),
  ].join('');
  const needsIdentity = scope.breakdown === 'BRAND' || scope.breakdown === 'MODEL';
  const rawBreakdown = rawDimension(scope.breakdown);
  const periodRows = scope.periods.map((period) => {
    const from = addParam(params, period.date_from); const to = addParam(params, period.date_to);
    const id = addParam(params, period.id); const label = addParam(params, period.label);
    return `SELECT ${id}::text AS period_id, ${label}::text AS period_label, ${from}::date AS date_from, ${to}::date AS date_to`;
  }).join('\nUNION ALL\n');
  const identityCtes = needsIdentity ? `,\n${rvmModelAliasCtes()},\n${rvmIdentityResolutionCte({ sourceCte: 'rvm_scoped' })}` : '';
  const source = needsIdentity ? 'identity_resolution' : 'rvm_scoped';
  let breakdownCte = '';
  if (rawBreakdown) {
    const [key,label] = rawBreakdown;
    breakdownCte = `,\nbreakdown_rows AS (\n  SELECT p.period_id,p.period_label,s.period_bucket,\n    coalesce(s.${key},'') AS bucket_key, min(s.${label}) AS bucket_label,\n    NULL::text AS identity_status, sum(coalesce(s.cantidad,0))::numeric AS units\n  FROM period_defs p JOIN ${source} s ON s.fecha BETWEEN p.date_from AND p.date_to\n  GROUP BY p.period_id,p.period_label,s.period_bucket,coalesce(s.${key},'')\n)`;
  } else if (scope.breakdown === 'BRAND') {
    breakdownCte = `,\nbreakdown_rows AS (\n  SELECT p.period_id,p.period_label,s.period_bucket,\n    CASE WHEN s.identity_status='RESUELTO' THEN 'BRAND:'||s.brand_id ELSE s.identity_status END AS bucket_key,\n    CASE WHEN s.identity_status='RESUELTO' THEN min(ma.nombre_canonico) WHEN s.identity_status='AMBIGUO' THEN 'AMBIGUOUS' ELSE 'UNRESOLVED' END AS bucket_label,\n    CASE WHEN s.identity_status='RESUELTO' THEN 'RESOLVED' WHEN s.identity_status='AMBIGUO' THEN 'AMBIGUOUS' ELSE 'UNRESOLVED' END AS identity_status,\n    sum(coalesce(s.cantidad,0))::numeric AS units\n  FROM period_defs p JOIN identity_resolution s ON s.fecha BETWEEN p.date_from AND p.date_to\n  LEFT JOIN marcas_master_v01 ma ON ma.marca_id=s.brand_id\n  GROUP BY p.period_id,p.period_label,s.period_bucket,s.identity_status,s.brand_id\n)`;
  } else if (scope.breakdown === 'MODEL') {
    breakdownCte = `,\nbreakdown_rows AS (\n  SELECT p.period_id,p.period_label,s.period_bucket,\n    CASE WHEN s.identity_status='RESUELTO' THEN 'MODEL:'||s.model_id ELSE s.identity_status END AS bucket_key,\n    CASE WHEN s.identity_status='RESUELTO' THEN min(m.nombre_canonico) WHEN s.identity_status='AMBIGUO' THEN 'AMBIGUOUS' ELSE 'UNRESOLVED' END AS bucket_label,\n    CASE WHEN s.identity_status='RESUELTO' THEN 'RESOLVED' WHEN s.identity_status='AMBIGUO' THEN 'AMBIGUOUS' ELSE 'UNRESOLVED' END AS identity_status,\n    sum(coalesce(s.cantidad,0))::numeric AS units\n  FROM period_defs p JOIN identity_resolution s ON s.fecha BETWEEN p.date_from AND p.date_to\n  LEFT JOIN modelos_master_v01 m ON m.modelo_id=s.model_id\n  GROUP BY p.period_id,p.period_label,s.period_bucket,s.identity_status,s.model_id\n)`;
  }
  const coverage = needsIdentity
    ? `SELECT count(*)::bigint AS total_rows,coalesce(sum(cantidad),0)::numeric AS total_units,\n      coalesce(sum(cantidad) FILTER (WHERE identity_status='RESUELTO'),0)::numeric AS resolved_units,\n      coalesce(sum(cantidad) FILTER (WHERE identity_status='AMBIGUO'),0)::numeric AS ambiguous_units,\n      coalesce(sum(cantidad) FILTER (WHERE identity_status='NO_RESUELTO'),0)::numeric AS unresolved_units,\n      coalesce(sum(cantidad) FILTER (WHERE cantidad<0),0)::numeric AS corrections_negative_units,\n      count(*) FILTER (WHERE cantidad IS DISTINCT FROM 1)::bigint AS non_standard_quantity_rows FROM identity_resolution`
    : `SELECT count(*)::bigint AS total_rows,coalesce(sum(cantidad),0)::numeric AS total_units,\n      NULL::numeric AS resolved_units,NULL::numeric AS ambiguous_units,NULL::numeric AS unresolved_units,\n      coalesce(sum(cantidad) FILTER (WHERE cantidad<0),0)::numeric AS corrections_negative_units,\n      count(*) FILTER (WHERE cantidad IS DISTINCT FROM 1)::bigint AS non_standard_quantity_rows FROM rvm_scoped`;
  const breakdownSelect = scope.breakdown
    ? `coalesce((SELECT jsonb_agg(jsonb_build_object('period_id',b.period_id,'period_label',b.period_label,'period_bucket',b.period_bucket,'bucket_key',b.bucket_key,'bucket_label',b.bucket_label,'identity_status',b.identity_status,'units',b.units) ORDER BY b.period_id,b.period_bucket,b.units DESC,b.bucket_key) FROM breakdown_rows b),'[]'::jsonb)`
    : `'[]'::jsonb`;
  const sql = `WITH\nperiod_defs AS (\n${periodRows}\n),\nrvm_scoped AS MATERIALIZED (\n  SELECT r.*,\n    date_trunc('${grain}',r.fecha)::date AS period_bucket,\n    master_norm(r.marca) AS raw_brand_norm,master_norm(r.modelo_homologado) AS raw_model_norm,master_norm(r.modeo_version) AS raw_version_norm,\n    master_norm(r.descripcion_segmento) AS segment_key,master_norm(r.descripcion_tipo) AS type_key,master_norm(r.combustible) AS fuel_key,\n    master_norm(r.region) AS region_key,master_norm(r.comuna_adquisicion) AS comuna_key\n  FROM rvm_raw r\n  WHERE EXISTS (SELECT 1 FROM period_defs p WHERE r.fecha BETWEEN p.date_from AND p.date_to)${filters}\n)${identityCtes},\nseries_rows AS (\n  SELECT p.period_id,p.period_label,s.period_bucket,sum(coalesce(s.cantidad,0))::numeric AS universe_units\n  FROM period_defs p JOIN ${source} s ON s.fecha BETWEEN p.date_from AND p.date_to\n  GROUP BY p.period_id,p.period_label,s.period_bucket\n),\nperiod_totals AS (\n  SELECT p.period_id,p.period_label,coalesce(sum(s.cantidad),0)::numeric AS universe_units\n  FROM period_defs p LEFT JOIN ${source} s ON s.fecha BETWEEN p.date_from AND p.date_to\n  GROUP BY p.period_id,p.period_label\n)${breakdownCte},\ncoverage AS (${coverage})\nSELECT\n  coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.period_id,s.period_bucket) FROM series_rows s),'[]'::jsonb) AS series,\n  coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.period_id) FROM period_totals p),'[]'::jsonb) AS period_totals,\n  ${breakdownSelect} AS breakdown,\n  to_jsonb(c) AS coverage\nFROM coverage c;`;
  return { sql, params, needsIdentity };
}
