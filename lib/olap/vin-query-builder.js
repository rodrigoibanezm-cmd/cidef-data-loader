import { VIN_CUBE } from './vin-cube-registry.js';

const qi = (v) => `"${String(v).replace(/"/g, '""')}"`;
const norm = (expr) => `NULLIF(UPPER(REGEXP_REPLACE(TRIM(${expr}::text), '\\s+', ' ', 'g')), '')`;
const boolExpr = (expr) => `CASE WHEN LOWER(TRIM(${expr}::text)) IN ('1','true','t','yes','si','sí') THEN true WHEN LOWER(TRIM(${expr}::text)) IN ('0','false','f','no') THEN false ELSE NULL END`;
const dateExpr = (expr) => {
  const text = `TRIM(${expr}::text)`;
  const iso = `LEFT(${text},10)`;
  const us = `SPLIT_PART(${text},' ',1)`;
  const usIso = `('20' || LPAD(SPLIT_PART(${us},'/',3),2,'0') || '-' || LPAD(SPLIT_PART(${us},'/',1),2,'0') || '-' || LPAD(SPLIT_PART(${us},'/',2),2,'0'))`;
  return `CASE
    WHEN ${text} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN CASE
      WHEN SUBSTRING(${iso},1,4)::int BETWEEN 1 AND 9999
        AND SUBSTRING(${iso},6,2)::int BETWEEN 1 AND 12
        AND SUBSTRING(${iso},9,2)::int BETWEEN 1 AND 31
        AND TO_CHAR(TO_DATE(${iso},'YYYY-MM-DD'),'YYYY-MM-DD') = ${iso}
      THEN TO_DATE(${iso},'YYYY-MM-DD') ELSE NULL END
    WHEN ${text} ~ '^\\d{1,2}/\\d{1,2}/\\d{2}( \\d{1,2}:\\d{2})?$' THEN CASE
      WHEN SPLIT_PART(${us},'/',1)::int BETWEEN 1 AND 12
        AND SPLIT_PART(${us},'/',2)::int BETWEEN 1 AND 31
        AND TO_CHAR(TO_DATE(${usIso},'YYYY-MM-DD'),'YYYY-MM-DD') = ${usIso}
      THEN TO_DATE(${usIso},'YYYY-MM-DD') ELSE NULL END
    ELSE NULL END`;
};
const OPS = {
  categorical: new Set(['eq','neq','in','not_in','is_null','not_null']),
  identity: new Set(['eq','neq','in','not_in','is_null','not_null']),
  numeric: new Set(['eq','neq','gt','gte','lt','lte','between','is_null','not_null']),
  boolean: new Set(['eq','is_null','not_null']),
};

export function validateVinQuery(input = {}) {
  if (input.cube !== VIN_CUBE.id) return ['INVALID_QUERY', 'cube must be VIN_SEMANTIC_CUBE_V0.1'];
  if (!input.universe || !VIN_CUBE.universes.includes(input.universe.type)) return ['INVALID_QUERY', 'invalid universe'];
  const operation = input.operation || 'AGGREGATE';
  if (!['AGGREGATE','TEMPORAL_BOUNDARY'].includes(operation)) return ['INVALID_QUERY', 'invalid operation'];
  if (input.universe.type === 'EVENT_POPULATION' && !VIN_CUBE.timeRoles[input.universe.event]) {
    return ['INCOMPATIBLE_TIME_ROLE', 'EVENT_POPULATION requires a valid event'];
  }
  if (operation === 'TEMPORAL_BOUNDARY') {
    if (!input.time?.role) return ['TIME_ROLE_REQUIRED', 'TEMPORAL_BOUNDARY requires time.role'];
    if (!VIN_CUBE.timeRoles[input.time.role]) return ['INCOMPATIBLE_TIME_ROLE', 'unknown time role'];
    if (!input.time.grain || !['day','month','quarter','year'].includes(input.time.grain)) {
      return ['INVALID_QUERY', 'TEMPORAL_BOUNDARY requires day, month, quarter or year grain'];
    }
    if (!['MIN','MAX'].includes(input.boundary)) return ['INVALID_QUERY', 'boundary must be MIN or MAX'];
    if (input.universe.type === 'EVENT_POPULATION' && input.universe.event !== input.time.role) {
      return ['INCOMPATIBLE_TIME_ROLE', 'EVENT_POPULATION event must match time.role'];
    }
    if (input.time.from || input.time.to) return ['INVALID_QUERY', 'TEMPORAL_BOUNDARY does not accept time ranges'];
    if ((input.measures || []).length || (input.derived_metrics || []).length || (input.dimensions || []).length) {
      return ['INVALID_QUERY', 'TEMPORAL_BOUNDARY does not accept measures, derived_metrics or dimensions'];
    }
  } else if (input.boundary != null) {
    return ['INVALID_QUERY', 'boundary only applies to TEMPORAL_BOUNDARY'];
  }
  const m = input.measures;
  if (operation === 'AGGREGATE') {
    if (!Array.isArray(m) || m.length !== 1 || m[0].name !== 'unit_count') return ['METRIC_NOT_AVAILABLE', 'only unit_count is public in V0.1'];
    if (m[0].aggregation !== 'SUM') return ['UNSUPPORTED_AGGREGATION', 'unit_count supports SUM only'];
  }
  if ((input.dimensions || []).length > 3) return ['INVALID_QUERY', 'at most 3 non-temporal dimensions are allowed'];
  if (input.time && !input.time.role) return ['TIME_ROLE_REQUIRED', 'time.role is required'];
  if (input.time?.grain != null && !['day','month','quarter','year'].includes(input.time.grain)) return ['INVALID_QUERY', 'unsupported time grain'];
  if (input.time?.role && !VIN_CUBE.timeRoles[input.time.role]) return ['INCOMPATIBLE_TIME_ROLE', 'unknown time role'];
  for (const d of input.dimensions || []) {
    const def = VIN_CUBE.dimensions[d.name];
    if (!def) return ['UNKNOWN_SEMANTIC_FIELD', `unknown dimension ${d.name}`];
    if (d.level && (!def.levels || !def.levels.includes(d.level))) return ['UNSUPPORTED_DIMENSION_LEVEL', `unsupported level for ${d.name}`];
    if (def.currentIdentity && input.time?.from && input.options?.identity_semantics !== 'current') return ['HISTORICAL_IDENTITY_NOT_AVAILABLE', `${d.name} is current identity only`];
  }
  const snapshotDims = (input.dimensions || []).filter((d) => VIN_CUBE.dimensions[d.name]?.snapshot);
  if (snapshotDims.length && input.time?.from && input.options?.snapshot_semantics !== 'current') return ['HISTORICAL_STATE_NOT_AVAILABLE', 'snapshot dimensions with historical event filters require options.snapshot_semantics="current"'];
  for (const f of input.filters || []) {
    if (!f?.field || typeof f.field !== 'object') return ['INVALID_QUERY', 'filter.field must be a semantic field object'];
    if (f.field.type === 'derived_metric') return ['METRIC_NOT_AVAILABLE', 'derived metric filters are not available in V0.1'];
    if (f.field.type !== 'dimension') return ['INVALID_QUERY', 'filter.field.type must be dimension'];
    const def = VIN_CUBE.dimensions[f.field.name];
    if (!def) return ['UNKNOWN_SEMANTIC_FIELD', `unknown filter field ${f.field.name}`];
    if (f.field.level && (!def.levels || !def.levels.includes(f.field.level))) return ['UNSUPPORTED_DIMENSION_LEVEL', `unsupported level for ${f.field.name}`];
    const allowed = OPS[def.type] || OPS.categorical;
    if (!allowed.has(f.op)) return ['INVALID_QUERY', `operator ${f.op} is invalid for ${def.type} dimension ${f.field.name}`];
  }
  for (const dm of input.derived_metrics || []) {
    if (dm.name !== 'aging_days') return ['METRIC_NOT_AVAILABLE', `derived metric ${dm.name} unavailable`];
    if (!['AVG','MIN','MAX'].includes(dm.aggregation)) return ['UNSUPPORTED_AGGREGATION', 'aging_days supports AVG/MIN/MAX'];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dm.as_of_date || ''))) return ['INVALID_QUERY', 'aging_days requires as_of_date YYYY-MM-DD'];
  }
  return null;
}

function joinNeeds(input) {
  const dims = [...(input.dimensions || []), ...(input.filters || []).map((f) => f.field).filter((f) => f?.type === 'dimension')];
  return dims.some((d) => d.name === 'dealer_sale' && d.level === 'canonical') || dims.some((d) => d.name === 'dealer_supervisor');
}

function dimensionExpression(dim, alias = 'i') {
  const def = VIN_CUBE.dimensions[dim.name];
  if (dim.name === 'dealer_sale' && dim.level === 'canonical') {
    return `CASE WHEN NULLIF(TRIM(${alias}.dealer_venta::text),'') IS NULL THEN '__MISSING__' WHEN d.dealer_id IS NULL THEN '__UNMATCHED__' ELSE d.dealer_id::text END`;
  }
  if (dim.name === 'dealer_supervisor') return dim.level === 'raw' ? `NULLIF(TRIM(d.${qi(def.masterColumn)}::text),'')` : norm(`d.${qi(def.masterColumn)}`);
  const raw = `${alias}.${qi(def.column)}`;
  if (def.type === 'boolean') return boolExpr(raw);
  if (def.type === 'numeric') return `NULLIF(REGEXP_REPLACE(${raw}::text,'[^0-9.-]','','g'),'')::numeric`;
  if (dim.level === 'normalized') return norm(raw);
  return `NULLIF(TRIM(${raw}::text),'')`;
}

function timeGrainExpression(input) {
  if (!input.time?.grain) return null;
  const d = dateExpr(`i.${qi(VIN_CUBE.timeRoles[input.time.role])}`);
  if (input.time.grain === 'day') return `TO_CHAR(${d},'YYYY-MM-DD')`;
  if (input.time.grain === 'month') return `TO_CHAR(${d},'YYYY-MM')`;
  if (input.time.grain === 'quarter') return `TO_CHAR(${d},'YYYY') || '-Q' || EXTRACT(QUARTER FROM ${d})::int`;
  return `TO_CHAR(${d},'YYYY')`;
}

function push(values, value) { values.push(value); return `$${values.length}`; }

function universeParts(input) {
  const parts = [];
  if (input.universe.type === 'DEALER_STOCK') parts.push(`i.es_dealer IS TRUE`, `i.vigente::text = '1'`, `NULLIF(TRIM(i.dealer_venta::text),'') IS NOT NULL`);
  if (input.universe.type === 'EVENT_POPULATION') {
    const role = VIN_CUBE.timeRoles[input.universe.event];
    if (!role) throw Object.assign(new Error('invalid EVENT_POPULATION event'), { code: 'INCOMPATIBLE_TIME_ROLE' });
    parts.push(`${dateExpr(`i.${qi(role)}`)} IS NOT NULL`);
  }
  return parts;
}

function filterSql(input, values) {
  const parts = [...universeParts(input)];
  if (input.time) {
    const d = dateExpr(`i.${qi(VIN_CUBE.timeRoles[input.time.role])}`);
    parts.push(`${d} IS NOT NULL`);
    if (input.time.from) parts.push(`${d} >= ${push(values, input.time.from)}::date`);
    if (input.time.to) parts.push(`${d} <= ${push(values, input.time.to)}::date`);
  }
  parts.push(...semanticFilterSql(input, values));
  return parts;
}

function semanticFilterSql(input, values) {
  const parts = [];
  for (const f of input.filters || []) {
    const expr = dimensionExpression({ name: f.field.name, level: f.field.level });
    if (f.op === 'is_null') { parts.push(`${expr} IS NULL`); continue; }
    if (f.op === 'not_null') { parts.push(`${expr} IS NOT NULL`); continue; }
    if (f.op === 'in' || f.op === 'not_in') {
      if (!Array.isArray(f.value) || !f.value.length) throw Object.assign(new Error('invalid in filter'), { code: 'INVALID_QUERY' });
      const ps = f.value.map((v) => push(values, v)); parts.push(`${expr} ${f.op === 'in' ? 'IN' : 'NOT IN'} (${ps.join(',')})`); continue;
    }
    if (f.op === 'between') {
      if (!Array.isArray(f.value) || f.value.length !== 2) throw Object.assign(new Error('invalid between filter'), { code: 'INVALID_QUERY' });
      parts.push(`${expr} BETWEEN ${push(values, f.value[0])}::numeric AND ${push(values, f.value[1])}::numeric`); continue;
    }
    const map = { eq:'=', neq:'<>', gt:'>', gte:'>=', lt:'<', lte:'<=' };
    const numeric = VIN_CUBE.dimensions[f.field.name].type === 'numeric';
    parts.push(`${expr} ${map[f.op]} ${push(values, f.value)}${numeric ? '::numeric' : ''}`);
  }
  return parts;
}

function fromSql(input) {
  if (!joinNeeds(input)) return `${qi(VIN_CUBE.source)} i`;
  return `${qi(VIN_CUBE.source)} i LEFT JOIN dealers_master d ON d.activo IS TRUE AND d.tipo='DEALER' AND ${norm('d.dealer')} = ${norm('i.dealer_venta')}`;
}

function eligibleWhere() { return `NULLIF(TRIM(i.${qi(VIN_CUBE.fact.key)}::text),'') IS NOT NULL`; }

export function buildVinSqlPlan(input) {
  const invalid = validateVinQuery(input); if (invalid) return { error: invalid };
  if ((input.operation || 'AGGREGATE') === 'TEMPORAL_BOUNDARY') return buildTemporalBoundarySqlPlan(input);
  const values = [];
  const filters = filterSql(input, values);
  const filterValues = [...values];
  const where = [eligibleWhere(), ...filters].join(' AND ');
  const from = fromSql(input);
  const dims = (input.dimensions || []).map((d) => ({ alias: d.as || d.name, expr: dimensionExpression(d) }));
  const tg = timeGrainExpression(input); if (tg) dims.push({ alias: 'time', expr: tg });
  const aging = (input.derived_metrics || []).map((dm) => {
    const stock = dateExpr(`i.${qi(VIN_CUBE.timeRoles.STOCK_ENTRY)}`);
    const base = `(${push(values, dm.as_of_date)}::date - ${stock})`;
    return { alias: dm.as || `${dm.name}_${dm.aggregation.toLowerCase()}`, expr: `${dm.aggregation}(${base}) FILTER (WHERE ${stock} IS NOT NULL)` };
  });
  const selectDims = dims.map((d) => `COALESCE(${d.expr}::text,'__MISSING__') AS ${qi(d.alias)}`);
  const groupBy = dims.map((d) => d.expr);
  const measureAlias = input.measures[0].as || 'unit_count';
  const grouped = `SELECT ${[...selectDims, `COUNT(*)::int AS ${qi(measureAlias)}`, ...aging.map((a) => `${a.expr} AS ${qi(a.alias)}`)].join(', ')} FROM ${from} WHERE ${where}${groupBy.length ? ` GROUP BY ${groupBy.join(', ')}` : ''}`;
  const limit = Math.max(1, Math.min(Number(input.options?.limit) || 300, 2000));
  const offset = Math.max(0, Number(input.options?.offset) || 0);
  const universeWhere = [eligibleWhere(), ...universeParts(input)].join(' AND ');
  return {
    values, filterValues,
    rows: `${grouped} ORDER BY ${dims.length ? dims.map((d) => qi(d.alias)).join(', ') : qi(measureAlias)} LIMIT ${limit} OFFSET ${offset}`,
    groupCount: `SELECT COUNT(*)::int AS groups FROM (${grouped}) g`,
    groupedTotal: `SELECT COALESCE(SUM(${qi(measureAlias)}),0)::int AS total FROM (${grouped}) g`,
    filteredCount: `SELECT COUNT(*)::int AS filtered_rows FROM ${from} WHERE ${where}`,
    usedCount: `SELECT COUNT(*)::int AS used_rows FROM ${from} WHERE ${where}`,
    sourceAudit: `SELECT COUNT(*)::int source_rows, COUNT(*) FILTER (WHERE i.${qi(VIN_CUBE.fact.key)} IS NULL)::int null_vin, COUNT(*) FILTER (WHERE i.${qi(VIN_CUBE.fact.key)} IS NOT NULL AND TRIM(i.${qi(VIN_CUBE.fact.key)}::text)='')::int blank_vin FROM ${qi(VIN_CUBE.source)} i`,
    duplicateAudit: `SELECT COUNT(*)::int duplicate_vin FROM (SELECT TRIM(i.${qi(VIN_CUBE.fact.key)}::text) vin FROM ${qi(VIN_CUBE.source)} i WHERE ${eligibleWhere()} GROUP BY 1 HAVING COUNT(*)>1) x`,
    eligibleCount: `SELECT COUNT(*)::int eligible_vin FROM ${qi(VIN_CUBE.source)} i WHERE ${eligibleWhere()}`,
    universeCount: `SELECT COUNT(*)::int universe_rows FROM ${from} WHERE ${universeWhere}`,
    temporalAudit: input.time ? `SELECT COUNT(*) FILTER (WHERE NULLIF(TRIM(i.${qi(VIN_CUBE.timeRoles[input.time.role])}::text),'') IS NOT NULL)::int non_null, COUNT(*) FILTER (WHERE NULLIF(TRIM(i.${qi(VIN_CUBE.timeRoles[input.time.role])}::text),'') IS NULL)::int null, COUNT(*) FILTER (WHERE NULLIF(TRIM(i.${qi(VIN_CUBE.timeRoles[input.time.role])}::text),'') IS NOT NULL AND ${dateExpr(`i.${qi(VIN_CUBE.timeRoles[input.time.role])}`)} IS NOT NULL)::int parsed, COUNT(*) FILTER (WHERE NULLIF(TRIM(i.${qi(VIN_CUBE.timeRoles[input.time.role])}::text),'') IS NOT NULL AND ${dateExpr(`i.${qi(VIN_CUBE.timeRoles[input.time.role])}`)} IS NULL)::int invalid FROM ${qi(VIN_CUBE.source)} i WHERE ${eligibleWhere()}` : null,
    limit, offset, measureAlias,
  };
}

export function buildTemporalBoundarySqlPlan(input) {
  const invalid = validateVinQuery(input); if (invalid) return { error: invalid };
  const values = [];
  const universe = universeParts(input);
  const semanticFilters = semanticFilterSql(input, values);
  const from = fromSql(input);
  const eligible = eligibleWhere();
  const filteredWhere = [eligible, ...universe, ...semanticFilters].join(' AND ');
  const parsedDate = dateExpr(`i.${qi(VIN_CUBE.timeRoles[input.time.role])}`);
  const usedWhere = `${filteredWhere} AND ${parsedDate} IS NOT NULL`;
  const aggregate = input.boundary;
  const format = {
    day: 'YYYY-MM-DD',
    month: 'YYYY-MM',
    year: 'YYYY',
  }[input.time.grain];
  const boundary = input.time.grain === 'quarter'
    ? `CASE WHEN ${aggregate}(${parsedDate}) IS NULL THEN NULL ELSE TO_CHAR(${aggregate}(${parsedDate}),'YYYY') || '-Q' || EXTRACT(QUARTER FROM ${aggregate}(${parsedDate}))::int END`
    : `TO_CHAR(${aggregate}(${parsedDate}),'${format}')`;
  const universeWhere = [eligible, ...universe].join(' AND ');
  const rawTime = `i.${qi(VIN_CUBE.timeRoles[input.time.role])}`;

  return {
    values,
    sourceAudit: `SELECT COUNT(*)::int source_rows, COUNT(*) FILTER (WHERE i.${qi(VIN_CUBE.fact.key)} IS NULL)::int null_vin, COUNT(*) FILTER (WHERE i.${qi(VIN_CUBE.fact.key)} IS NOT NULL AND TRIM(i.${qi(VIN_CUBE.fact.key)}::text)='')::int blank_vin FROM ${qi(VIN_CUBE.source)} i`,
    duplicateAudit: `SELECT COUNT(*)::int duplicate_vin FROM (SELECT TRIM(i.${qi(VIN_CUBE.fact.key)}::text) vin FROM ${qi(VIN_CUBE.source)} i WHERE ${eligible} GROUP BY 1 HAVING COUNT(*)>1) x`,
    eligibleCount: `SELECT COUNT(*)::int eligible_vin FROM ${qi(VIN_CUBE.source)} i WHERE ${eligible}`,
    universeCount: `SELECT COUNT(*)::int universe_rows FROM ${from} WHERE ${universeWhere}`,
    filteredCount: `SELECT COUNT(*)::int filtered_rows FROM ${from} WHERE ${filteredWhere}`,
    usedCount: `SELECT COUNT(*)::int used_rows FROM ${from} WHERE ${usedWhere}`,
    boundary: `SELECT ${boundary} AS boundary FROM ${from} WHERE ${usedWhere}`,
    temporalAudit: `SELECT COUNT(*) FILTER (WHERE NULLIF(TRIM(${rawTime}::text),'') IS NOT NULL)::int non_null, COUNT(*) FILTER (WHERE NULLIF(TRIM(${rawTime}::text),'') IS NULL)::int null, COUNT(*) FILTER (WHERE NULLIF(TRIM(${rawTime}::text),'') IS NOT NULL AND ${parsedDate} IS NOT NULL)::int parsed, COUNT(*) FILTER (WHERE NULLIF(TRIM(${rawTime}::text),'') IS NOT NULL AND ${parsedDate} IS NULL)::int invalid FROM ${from} WHERE ${filteredWhere}`,
  };
}
