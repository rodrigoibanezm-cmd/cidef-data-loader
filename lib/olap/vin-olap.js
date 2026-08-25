import { neon } from '@neondatabase/serverless';
import { VIN_CUBE } from './vin-cube-registry.js';
import { buildVinSqlPlan, validateVinQuery } from './vin-query-builder.js';
import { reconcileUniverse } from './vin-auditors.js';
import { executeVinOlap } from './vin-engine.js';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function fail(code, message, query = {}) {
  return { ok:false, status:'FAIL', cube:{ name:VIN_CUBE.name, version:VIN_CUBE.version }, query, result:null, coverage:null,
    audit:{ status:'FAIL', checks:[{ name:code, status:'FAIL', message }] }, warnings:[], lineage:{} };
}

export async function run(input = {}) {
  const invalid = validateVinQuery(input);
  if (invalid) return fail(invalid[0], invalid[1], input);
  let plan;
  try { plan = buildVinSqlPlan(input); }
  catch (e) { return fail(e.code || 'INVALID_QUERY', e.message, input); }
  if (plan.error) return fail(plan.error[0], plan.error[1], input);

  const sql = db();
  const [sourceAuditRows, duplicateRows, eligibleRows, universeRows, filteredRows, usedRows, groupCountRows, groupedTotalRows, resultRows, temporalRows] = await Promise.all([
    sql.query(plan.sourceAudit),
    sql.query(plan.duplicateAudit),
    sql.query(plan.eligibleCount),
    sql.query(plan.universeCount),
    sql.query(plan.filteredCount, plan.values),
    sql.query(plan.usedCount, plan.values),
    sql.query(plan.groupCount, plan.values),
    sql.query(plan.groupedTotal, plan.values),
    sql.query(plan.rows, plan.values),
    plan.temporalAudit ? sql.query(plan.temporalAudit) : Promise.resolve([]),
  ]);

  const src = sourceAuditRows[0];
  const duplicates = Number(duplicateRows[0]?.duplicate_vin || 0);
  if (duplicates > 0) return fail('VIN_GRAIN_VIOLATION', `duplicate VIN detected: ${duplicates}`, input);

  const sourceRows = Number(src?.source_rows || 0);
  const eligible = Number(eligibleRows[0]?.eligible_vin || 0);
  const universe = Number(universeRows[0]?.universe_rows || 0);
  const filtered = Number(filteredRows[0]?.filtered_rows || 0);
  const used = Number(usedRows[0]?.used_rows || 0);
  const groupedTotal = Number(groupedTotalRows[0]?.total || 0);
  if (groupedTotal !== used) return fail('AGGREGATION_RECONCILIATION_FAILURE', 'group totals do not match used rows', input);

  const excludedIneligible = sourceRows - eligible;
  const excludedByUniverse = eligible - universe;
  const excludedByFilter = universe - filtered;
  const excludedInvalid = filtered - used;
  const reconciliation = reconcileUniverse({
    source:sourceRows,
    eligible,
    universe,
    filtered,
    used,
    excludedIneligible,
    excludedByUniverse,
    excludedByFilter,
    excludedInvalid,
  });
  if (reconciliation.status === 'FAIL') return fail('UNIVERSE_RECONCILIATION_FAILURE', 'universe reconciliation failed', input);

  const checks = [
    { name:'VIN Universe Audit', status:'PASS', details:{ source_rows:sourceRows, null_vin:Number(src?.null_vin||0), blank_vin:Number(src?.blank_vin||0), duplicate_vin:0, eligible_vin:eligible } },
  ];
  if (input.universe.type === 'DEALER_STOCK') checks.push({ name:'Dealer Stock Audit', status:'PASS', definition:"es_dealer=true AND vigente='1' AND dealer_venta IS NOT NULL" });
  if (input.time) {
    const t = temporalRows[0] || {};
    const invalidDates = Number(t.invalid || 0);
    checks.push({ name:'Time Role Audit', status:'PASS', role:input.time.role });
    checks.push({ name:'Temporal Parse Audit', status:invalidDates ? 'WARNING' : 'PASS', role:input.time.role, details:{ non_null:Number(t.non_null||0), parsed:Number(t.parsed||0), invalid:invalidDates, null:Number(t.null||0) } });
  }
  checks.push({ name:'Universe Reconciliation', status:'PASS', equations:reconciliation.equations });
  checks.push({ name:'Aggregation Reconciliation', status:'PASS', expected:used, actual:groupedTotal });

  const warnings = checks.filter((c) => c.status === 'WARNING').map((c) => c.name);
  const status = warnings.length ? 'WARNING' : 'PASS';
  const measureAlias = plan.measureAlias;
  const groups = Number(groupCountRows[0]?.groups || 0);
  const usesDealerMaster = (input.dimensions || []).some((d) => d.name === 'dealer_supervisor' || (d.name === 'dealer_sale' && d.level === 'canonical')) ||
    (input.filters || []).some((f) => f.field?.name === 'dealer_supervisor' || (f.field?.name === 'dealer_sale' && f.field?.level === 'canonical'));

  return {
    ok:true, status, cube:{ name:VIN_CUBE.name, version:VIN_CUBE.version }, query:input,
    result:{ rows:resultRows, totals:input.options?.include_totals === false ? {} : { [measureAlias]:used }, rows_returned:resultRows.length, has_more:plan.offset + resultRows.length < groups },
    coverage:input.options?.include_coverage === false ? undefined : {
      source_rows:sourceRows,
      eligible_vin:eligible,
      universe_rows:universe,
      filtered_rows:filtered,
      normalized_rows:used,
      used_rows:used,
      excluded:[
        { reason:'INELIGIBLE_VIN', rows:excludedIneligible },
        { reason:'EXCLUDED_BY_UNIVERSE', rows:excludedByUniverse },
        { reason:'EXCLUDED_BY_FILTER', rows:excludedByFilter },
        { reason:'INVALID_REQUIRED_FIELD', rows:excludedInvalid },
      ],
    },
    audit:{ status, checks }, warnings,
    lineage:input.options?.include_lineage === false ? undefined : { physical_source:VIN_CUBE.source, fact:VIN_CUBE.fact.name, cube_version:VIN_CUBE.version, universe:input.universe, time_role:input.time?.role || null, normalizations:['VIN:TRIM','text:TRIM+whitespace+UPPER'], identity_masters:usesDealerMaster ? ['dealers_master'] : [] },
  };
}

export { executeVinOlap } from './vin-engine.js';
