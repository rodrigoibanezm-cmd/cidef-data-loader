import { VIN_CUBE } from '../../vin-cube-registry.js';
import { boundaryCheck, dealerStockCheck, temporalParseCheck, timeRoleCheck, universeCheck, vinUniverseCheck } from '../../output/audit-checks.js';
import { calculateCoverage, coverageOutput } from '../../output/coverage.js';
import { lineageOutput } from '../../output/lineage.js';
import { failResult } from '../../output/result-envelope.js';
import { runCountQueries } from './query-counts.js';

export async function executeSqlTemporalBoundary(sql, input, plan) {
  const [counts, boundaryRows, temporalRows] = await Promise.all([
    runCountQueries(sql, plan),
    sql.query(plan.boundary, plan.values),
    sql.query(plan.temporalAudit, plan.values),
  ]);
  if (counts.duplicates > 0) {
    return failResult('VIN_GRAIN_VIOLATION',
      `duplicate VIN detected: ${counts.duplicates}`, input);
  }
  const coverage = calculateCoverage(
    counts.source, counts.eligible, counts.universe, counts.filtered, counts.used);
  if (coverage.reconciliation.status === 'FAIL') {
    return failResult('UNIVERSE_RECONCILIATION_FAILURE',
      'universe reconciliation failed', input);
  }
  const rawTemporal = temporalRows[0] || {};
  const temporal = {
    non_null:Number(rawTemporal.non_null || 0),
    parsed:Number(rawTemporal.parsed || 0),
    invalid:Number(rawTemporal.invalid || 0),
    null:Number(rawTemporal.null || 0),
  };
  const boundary = boundaryRows[0]?.boundary ?? null;
  const checks = [vinUniverseCheck(counts.source, counts.eligible, counts.sourceAudit)];
  if (input.universe.type === 'DEALER_STOCK') checks.push(dealerStockCheck());
  checks.push(timeRoleCheck(input.time.role));
  checks.push(temporalParseCheck(input.time.role, temporal));
  checks.push(universeCheck(coverage.reconciliation));
  checks.push(boundaryCheck(input, counts.used, boundary));
  const warnings = [];
  if (temporal.invalid) warnings.push('Temporal Parse Audit');
  if (boundary == null) warnings.push('NO_TEMPORAL_DATA');
  const status = warnings.length ? 'WARNING' : 'PASS';
  return {
    ok:true,
    status,
    cube:{ name:VIN_CUBE.name, version:VIN_CUBE.version },
    operation:'TEMPORAL_BOUNDARY',
    query:input,
    result:{
      boundary,
      boundary_type:input.boundary,
      time_role:input.time.role,
      grain:input.time.grain,
    },
    coverage:coverageOutput(input, coverage),
    audit:{ status, checks },
    warnings,
    lineage:lineageOutput(input, {
      operation:'TEMPORAL_BOUNDARY',
      sql:true,
      identity:'none',
    }),
  };
}
