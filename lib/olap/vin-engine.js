import { VIN_CUBE } from './vin-cube-registry.js';
import { normalizeText, normalizeVin, parseSourceDate, dateKey, daysBetween } from './vin-normalizers.js';
import { auditVinUniverse, auditTemporal, reconcileUniverse, reconcileAggregation } from './vin-auditors.js';
import { validateVinQuery } from './vin-query-builder.js';

function fail(code, message, query = {}) {
  return { ok:false, status:'FAIL', cube:{ name:VIN_CUBE.name, version:VIN_CUBE.version }, query, result:null, coverage:null,
    audit:{ status:'FAIL', checks:[{ name:code, status:'FAIL', message }] }, warnings:[], lineage:{} };
}

function parseIsoDate(value) {
  if (value == null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2]-1 && d.getUTCDate() === +m[3] ? d : null;
}

function dealerIndex(dealerRows) {
  const map = new Map();
  for (const d of dealerRows) map.set(normalizeText(d.dealer), { id:String(d.dealer_id), supervisor:d.supervisor ?? null });
  return map;
}

function dimValue(row, dim, dealers) {
  const def = VIN_CUBE.dimensions[dim.name];
  if (dim.name === 'dealer_supervisor') {
    const dealer = dealers.get(normalizeText(row.dealer_venta));
    const raw = dealer?.supervisor ?? null;
    return dim.level === 'raw' ? (raw == null ? null : String(raw).trim() || null) : normalizeText(raw);
  }
  const raw = row[def.column] ?? (def.fallbackColumn ? row[def.fallbackColumn] : null);
  if (dim.name === 'dealer_sale' && dim.level === 'canonical') {
    const normalized = normalizeText(raw);
    if (!normalized) return '__MISSING__';
    return dealers.get(normalized)?.id ?? '__UNMATCHED__';
  }
  if (def.type === 'boolean') {
    if (raw == null || String(raw).trim() === '') return null;
    const v = String(raw).trim().toLowerCase();
    if (['1','true','t','yes','si','sí'].includes(v)) return true;
    if (['0','false','f','no'].includes(v)) return false;
    return null;
  }
  if (def.type === 'numeric') return raw == null || String(raw).trim() === '' ? null : Number(String(raw).replace(/[^0-9.-]/g,''));
  if (dim.level === 'normalized') return normalizeText(raw);
  return raw == null || String(raw).trim() === '' ? null : String(raw).trim();
}

function passesFilter(value, f) {
  if (f.op === 'is_null') return value == null || value === '__MISSING__';
  if (f.op === 'not_null') return value != null && value !== '__MISSING__';
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
  const invalid = validateVinQuery(input);
  if (invalid) return fail(invalid[0], invalid[1], input);
  const vinAudit = auditVinUniverse(sourceRows, (r) => r[VIN_CUBE.fact.key]);
  if (vinAudit.status === 'FAIL') return fail('VIN_GRAIN_VIOLATION', 'duplicate VIN detected', input);

  const dealers = dealerIndex(dealerRows);
  const eligible = sourceRows.filter((r) => normalizeVin(r[VIN_CUBE.fact.key]).normalized);
  let universe = eligible;
  const checks = [{ name:'VIN Universe Audit', status:'PASS', details:vinAudit }];
  if (input.universe.type === 'DEALER_STOCK') {
    universe = eligible.filter((r) => r.es_dealer === true && String(r.vigente ?? '') === '1' && normalizeText(r.dealer_venta));
    checks.push({ name:'Dealer Stock Audit', status:'PASS', definition:"es_dealer=true AND vigente='1' AND dealer_venta IS NOT NULL" });
  }
  if (input.universe.type === 'EVENT_POPULATION') {
    const col = VIN_CUBE.timeRoles[input.universe.event];
    if (!col) return fail('INCOMPATIBLE_TIME_ROLE', 'EVENT_POPULATION event is not a registered time role', input);
    universe = eligible.filter((r) => parseSourceDate(r[col]).status === 'parsed');
  }

  let filtered = universe;
  if (input.time) {
    const col = VIN_CUBE.timeRoles[input.time.role];
    const ta = auditTemporal(universe.map((r) => r[col]), parseSourceDate);
    checks.push({ name:'Time Role Audit', status:'PASS', role:input.time.role });
    checks.push({ name:'Temporal Parse Audit', status:ta.status, role:input.time.role, details:ta });
    const from = parseIsoDate(input.time.from); const to = parseIsoDate(input.time.to);
    filtered = filtered.filter((r) => { const p = parseSourceDate(r[col]); return p.status === 'parsed' && (!from || p.date >= from) && (!to || p.date <= to); });
  }
  for (const f of input.filters || []) {
    const dim = { name:f.field.name, level:f.field.level };
    filtered = filtered.filter((r) => passesFilter(dimValue(r, dim, dealers), f));
  }

  const used = filtered;
  const groups = new Map();
  for (const row of used) {
    const keyParts = []; const out = {};
    for (const d of input.dimensions || []) { const v = dimValue(row, d, dealers); out[d.as || d.name] = v == null ? '__MISSING__' : v; keyParts.push(out[d.as || d.name]); }
    if (input.time?.grain) { const tk = dateKey(parseSourceDate(row[VIN_CUBE.timeRoles[input.time.role]]).date, input.time.grain); out.time = tk; keyParts.push(tk); }
    const key = JSON.stringify(keyParts);
    if (!groups.has(key)) groups.set(key, { ...out, __units:0, __aging:[] });
    const g = groups.get(key); g.__units += 1;
    for (const dm of input.derived_metrics || []) {
      const p = parseSourceDate(row[VIN_CUBE.timeRoles.STOCK_ENTRY]);
      if (p.status === 'parsed') g.__aging.push(daysBetween(parseIsoDate(dm.as_of_date), p.date));
    }
  }
  const alias = input.measures[0].as || 'unit_count';
  const allRows = [...groups.values()].map((g) => {
    const r = { ...g, [alias]:g.__units }; delete r.__units;
    for (const dm of input.derived_metrics || []) { const vals = r.__aging; const a = dm.as || `${dm.name}_${dm.aggregation.toLowerCase()}`; r[a] = vals.length ? (dm.aggregation === 'AVG' ? vals.reduce((x,y)=>x+y,0)/vals.length : dm.aggregation === 'MIN' ? Math.min(...vals) : Math.max(...vals)) : null; }
    delete r.__aging; return r;
  });
  const totalUnits = used.length;
  const agg = reconcileAggregation(totalUnits, allRows.reduce((s,r) => s + r[alias], 0));
  checks.push({ name:'Aggregation Reconciliation', ...agg });
  if (agg.status === 'FAIL') return fail('AGGREGATION_RECONCILIATION_FAILURE', 'group totals do not match used rows', input);

  const excludedIneligible = sourceRows.length - eligible.length;
  const excludedByUniverse = eligible.length - universe.length;
  const excludedByFilter = universe.length - filtered.length;
  const excludedInvalid = filtered.length - used.length;
  const ur = reconcileUniverse({ source:sourceRows.length, eligible:eligible.length, universe:universe.length, filtered:filtered.length, used:used.length, excludedIneligible, excludedByUniverse, excludedByFilter, excludedInvalid });
  checks.push({ name:'Universe Reconciliation', ...ur });
  if (ur.status === 'FAIL') return fail('UNIVERSE_RECONCILIATION_FAILURE', 'universe reconciliation failed', input);

  const limit = Math.max(1, Math.min(Number(input.options?.limit) || 300, 2000));
  const offset = Math.max(0, Number(input.options?.offset) || 0);
  const rows = allRows.slice(offset, offset + limit);
  const warnings = checks.filter((c) => c.status === 'WARNING').map((c) => c.name); const status = warnings.length ? 'WARNING' : 'PASS';
  return { ok:true, status, cube:{ name:VIN_CUBE.name, version:VIN_CUBE.version }, query:input,
    result:{ rows, totals:input.options?.include_totals === false ? {} : { [alias]:totalUnits }, rows_returned:rows.length, has_more:offset + rows.length < allRows.length },
    coverage:input.options?.include_coverage === false ? undefined : { source_rows:sourceRows.length, eligible_vin:eligible.length, universe_rows:universe.length, filtered_rows:filtered.length, normalized_rows:used.length, used_rows:used.length, excluded:[{reason:'INELIGIBLE_VIN',rows:excludedIneligible},{reason:'EXCLUDED_BY_UNIVERSE',rows:excludedByUniverse},{reason:'EXCLUDED_BY_FILTER',rows:excludedByFilter},{reason:'INVALID_REQUIRED_FIELD',rows:excludedInvalid}] },
    audit:{ status, checks }, warnings,
    lineage:input.options?.include_lineage === false ? undefined : { physical_source:VIN_CUBE.source, fact:VIN_CUBE.fact.name, cube_version:VIN_CUBE.version, universe:input.universe, time_role:input.time?.role || null, normalizations:['VIN:TRIM','text:TRIM+control-whitespace+UPPER'], identity_masters:(input.dimensions || []).some((d)=>d.name==='dealer_supervisor'||(d.name==='dealer_sale'&&d.level==='canonical')) ? ['dealers_master'] : [] },
  };
}
