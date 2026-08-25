import { VIN_CUBE } from './vin-cube-registry.js';
import { normalizeText, normalizeVin, parseSourceDate, dateKey, daysBetween } from './vin-normalizers.js';
import { auditVinUniverse, auditTemporal, reconcileUniverse, reconcileAggregation } from './vin-auditors.js';

const CATEGORICAL_OPS = new Set(['eq','neq','in','not_in','is_null','not_null']);
const NUMERIC_OPS = new Set(['eq','neq','gt','gte','lt','lte','between','is_null','not_null']);
const BOOL_OPS = new Set(['eq']);
const GRAINS = new Set(['day','month','quarter','year']);

function fail(code, message, query = {}) {
  return { ok: false, status: 'FAIL', cube: { name: VIN_CUBE.name, version: VIN_CUBE.version }, query, result: null, coverage: null,
    audit: { status: 'FAIL', checks: [{ name: code, status: 'FAIL', message }] }, warnings: [], lineage: {} };
}

function parseIsoDate(value) {
  if (value == null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateQuery(input) {
  if (input.cube !== VIN_CUBE.id) return ['INVALID_QUERY', 'cube must be VIN_SEMANTIC_CUBE_V0.1'];
  if (!input.universe || !VIN_CUBE.universes.includes(input.universe.type)) return ['INVALID_QUERY', 'invalid universe'];
  if (!Array.isArray(input.measures) || input.measures.length !== 1 || input.measures[0].name !== 'unit_count') return ['METRIC_NOT_AVAILABLE', 'only unit_count is public in V0.1'];
  if (input.measures[0].aggregation !== 'SUM') return ['UNSUPPORTED_AGGREGATION', 'unit_count supports SUM only'];
  if ((input.dimensions || []).length > 3) return ['INVALID_QUERY', 'at most 3 non-temporal dimensions are allowed'];
  if (input.time && !input.time.role) return ['TIME_ROLE_REQUIRED', 'time.role is required'];
  if (input.time?.grain != null && !GRAINS.has(input.time.grain)) return ['INVALID_QUERY', 'unsupported time grain'];
  if (input.time?.role && !VIN_CUBE.timeRoles[input.time.role]) return ['INCOMPATIBLE_TIME_ROLE', 'unknown time role'];
  for (const d of input.dimensions || []) {
    const def = VIN_CUBE.dimensions[d.name];
    if (!def) return ['UNKNOWN_SEMANTIC_FIELD', `unknown dimension ${d.name}`];
    if (d.level && (!def.levels || !def.levels.includes(d.level))) return ['UNSUPPORTED_DIMENSION_LEVEL', `unsupported level for ${d.name}`];
  }
  for (const f of input.filters || []) {
    const def = VIN_CUBE.dimensions[f.field];
    if (!def) return ['UNKNOWN_SEMANTIC_FIELD', `unknown filter field ${f.field}`];
    const ops = def.type === 'numeric' ? NUMERIC_OPS : def.type === 'boolean' ? BOOL_OPS : CATEGORICAL_OPS;
    if (!ops.has(f.op)) return ['INVALID_QUERY', `unsupported filter op for ${f.field}`];
  }
  for (const dm of input.derived_metrics || []) {
    if (dm.name !== 'aging_days') return ['METRIC_NOT_AVAILABLE', `derived metric ${dm.name} unavailable`];
    if (!['AVG','MIN','MAX'].includes(dm.aggregation)) return ['UNSUPPORTED_AGGREGATION', 'aging_days supports AVG/MIN/MAX'];
    if (!parseIsoDate(dm.as_of_date)) return ['INVALID_QUERY', 'aging_days requires as_of_date YYYY-MM-DD'];
  }
  const snapshotDims = (input.dimensions || []).filter((d) => VIN_CUBE.dimensions[d.name]?.snapshot);
  if (snapshotDims.length && input.time?.from && input.options?.snapshot_semantics !== 'current') {
    return ['HISTORICAL_STATE_NOT_AVAILABLE', 'snapshot dimensions with historical event filters require options.snapshot_semantics="current"'];
  }
  return null;
}

function dimValue(row, dim, dealerMap) {
  const def = VIN_CUBE.dimensions[dim.name];
  const raw = row[def.column] ?? (def.fallbackColumn ? row[def.fallbackColumn] : null);
  if (dim.level === 'raw' || !dim.level) return raw == null || String(raw).trim() === '' ? null : String(raw).trim();
  const normalized = normalizeText(raw);
  if (dim.level === 'normalized') return normalized;
  if (dim.name === 'dealer_sale' && dim.level === 'canonical') return dealerMap.get(normalized) ?? '__UNMATCHED__';
  return null;
}

function passesFilter(value, f) {
  if (f.op === 'is_null') return value == null;
  if (f.op === 'not_null') return value != null;
  if (f.op === 'eq') return value === f.value;
  if (f.op === 'neq') return value !== f.value;
  if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(value);
  if (f.op === 'not_in') return Array.isArray(f.value) && !f.value.includes(value);
  if (f.op === 'between') return Array.isArray(f.value) && f.value.length === 2 && Number(value) >= Number(f.value[0]) && Number(value) <= Number(f.value[1]);
  if (f.op === 'gt') return Number(value) > Number(f.value);
  if (f.op === 'gte') return Number(value) >= Number(f.value);
  if (f.op === 'lt') return Number(value) < Number(f.value);
  if (f.op === 'lte') return Number(value) <= Number(f.value);
  return false;
}

export function executeVinOlap(input, sourceRows, dealerRows = []) {
  const invalid = validateQuery(input);
  if (invalid) return fail(invalid[0], invalid[1], input);

  const vinAudit = auditVinUniverse(sourceRows, (r) => r[VIN_CUBE.fact.key]);
  if (vinAudit.status === 'FAIL') return fail('VIN_GRAIN_VIOLATION', 'duplicate VIN detected', input);

  const dealerMap = new Map();
  for (const d of dealerRows) dealerMap.set(normalizeText(d.dealer), d.dealer_id || normalizeText(d.dealer));
  const eligible = sourceRows.filter((r) => normalizeVin(r[VIN_CUBE.fact.key]).normalized);
  let universe = eligible;
  const checks = [{ name: 'VIN Universe Audit', status: 'PASS', details: vinAudit }];

  if (input.universe.type === 'DEALER_STOCK') {
    universe = eligible.filter((r) => r.es_dealer === true && String(r.vigente ?? '') === '1' && normalizeText(r.dealer_venta));
    checks.push({ name: 'Dealer Stock Audit', status: 'PASS', definition: "es_dealer=true AND vigente='1' AND dealer_venta IS NOT NULL" });
  }

  if (input.universe.type === 'EVENT_POPULATION') {
    const col = VIN_CUBE.timeRoles[input.universe.event];
    if (!col) return fail('INCOMPATIBLE_TIME_ROLE', 'EVENT_POPULATION event is not a registered time role', input);
    const ta = auditTemporal(eligible.map((r) => r[col]), parseSourceDate);
    checks.push({ name: 'Temporal Parse Audit', status: ta.status, role: input.universe.event, details: ta });
    universe = eligible.filter((r) => parseSourceDate(r[col]).status === 'parsed');
  }

  let filtered = universe;
  let excludedInvalid = 0;
  if (input.time) {
    const col = VIN_CUBE.timeRoles[input.time.role];
    const ta = auditTemporal(universe.map((r) => r[col]), parseSourceDate);
    checks.push({ name: 'Time Role Audit', status: 'PASS', role: input.time.role });
    checks.push({ name: 'Temporal Parse Audit', status: ta.status, role: input.time.role, details: ta });
    const from = parseIsoDate(input.time.from); const to = parseIsoDate(input.time.to);
    filtered = filtered.filter((r) => {
      const p = parseSourceDate(r[col]);
      if (p.status !== 'parsed') { excludedInvalid += 1; return false; }
      return (!from || p.date >= from) && (!to || p.date <= to);
    });
  }

  for (const f of input.filters || []) {
    const pseudoDim = { name: f.field, level: f.level || (VIN_CUBE.dimensions[f.field].levels?.includes('normalized') ? 'normalized' : undefined) };
    filtered = filtered.filter((r) => passesFilter(dimValue(r, pseudoDim, dealerMap), f));
  }

  const groups = new Map();
  const metrics = input.derived_metrics || [];
  for (const row of filtered) {
    const keyParts = [];
    const out = {};
    for (const d of input.dimensions || []) {
      const v = dimValue(row, d, dealerMap);
      out[d.as || d.name] = v == null ? '__MISSING__' : v;
      keyParts.push(out[d.as || d.name]);
    }
    if (input.time?.grain) {
      const p = parseSourceDate(row[VIN_CUBE.timeRoles[input.time.role]]);
      const tk = dateKey(p.date, input.time.grain);
      out.time = tk; keyParts.push(tk);
    }
    const key = JSON.stringify(keyParts);
    if (!groups.has(key)) groups.set(key, { ...out, __units: 0, __aging: [] });
    const g = groups.get(key); g.__units += 1;
    for (const dm of metrics) {
      if (dm.name === 'aging_days') {
        const p = parseSourceDate(row[VIN_CUBE.timeRoles.STOCK_ENTRY]);
        if (p.status === 'parsed') g.__aging.push(daysBetween(parseIsoDate(dm.as_of_date), p.date));
      }
    }
  }

  const alias = input.measures[0].as || 'unit_count';
  const allRows = [...groups.values()].map((g) => {
    const r = { ...g, [alias]: g.__units }; delete r.__units;
    for (const dm of metrics) {
      const vals = r.__aging;
      const a = dm.as || `${dm.name}_${dm.aggregation.toLowerCase()}`;
      r[a] = vals.length ? (dm.aggregation === 'AVG' ? vals.reduce((x,y)=>x+y,0)/vals.length : dm.aggregation === 'MIN' ? Math.min(...vals) : Math.max(...vals)) : null;
    }
    delete r.__aging; return r;
  });

  const totalUnits = filtered.length;
  const agg = reconcileAggregation(totalUnits, allRows.reduce((s, r) => s + r[alias], 0));
  checks.push({ name: 'Aggregation Reconciliation', ...agg });
  if (agg.status === 'FAIL') return fail('AGGREGATION_RECONCILIATION_FAILURE', 'group totals do not match universe total', input);

  const excludedIneligible = sourceRows.length - eligible.length;
  const excludedByFilter = eligible.length - filtered.length;
  const ur = reconcileUniverse({ source: sourceRows.length, eligible: eligible.length, filtered: filtered.length, used: filtered.length, excludedIneligible, excludedByFilter, excludedInvalid: 0 });
  checks.push({ name: 'Universe Reconciliation', ...ur });
  if (ur.status === 'FAIL') return fail('UNIVERSE_RECONCILIATION_FAILURE', 'universe reconciliation failed', input);

  const limit = Math.max(1, Math.min(Number(input.options?.limit) || 300, 2000));
  const offset = Math.max(0, Number(input.options?.offset) || 0);
  const rows = allRows.slice(offset, offset + limit);
  const warnings = checks.filter((c) => c.status === 'WARNING').map((c) => c.name);
  const status = warnings.length ? 'WARNING' : 'PASS';

  return {
    ok: true, status, cube: { name: VIN_CUBE.name, version: VIN_CUBE.version }, query: input,
    result: { rows, totals: input.options?.include_totals === false ? {} : { [alias]: totalUnits }, rows_returned: rows.length, has_more: offset + rows.length < allRows.length },
    coverage: input.options?.include_coverage === false ? undefined : { source_rows: sourceRows.length, eligible_vin: eligible.length, universe_rows: universe.length, filtered_rows: filtered.length, normalized_rows: filtered.length, used_rows: filtered.length, excluded: [{ reason: 'ineligible_vin', rows: excludedIneligible }, { reason: 'filters_or_time', rows: universe.length - filtered.length }, { reason: 'invalid_required_fields', rows: excludedInvalid }] },
    audit: { status, checks }, warnings,
    lineage: input.options?.include_lineage === false ? undefined : { physical_source: VIN_CUBE.source, fact: VIN_CUBE.fact.name, cube_version: VIN_CUBE.version, universe: input.universe, time_role: input.time?.role || null, normalizations: ['VIN:TRIM','text:TRIM+control-whitespace+UPPER'], identity_masters: (input.dimensions || []).some((d)=>d.name==='dealer_sale'&&d.level==='canonical') ? ['dealers_master'] : [] },
  };
}
