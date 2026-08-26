import { VIN_CUBE } from '../../vin-cube-registry.js';
import { dealerStockCheck, temporalParseCheck, timeRoleCheck, vinUniverseCheck } from '../../output/audit-checks.js';
import { calculateCoverage, coverageOutput } from '../../output/coverage.js';
import { lineageOutput } from '../../output/lineage.js';
import { failResult, resultStatus } from '../../output/result-envelope.js';
import { numericRow, runCountQueries } from './query-counts.js';

export async function executeSqlAggregate(sql, input, plan) {
  const [counts, groupCountRows, groupedTotalRows, resultRows, temporalRows] = await Promise.all([
    runCountQueries(sql, plan),
    sql.query(plan.groupCount, plan.values),
    sql.query(plan.groupedTotal, plan.values),
    sql.query(plan.rows, plan.values),
    plan.temporalAudit ? sql.query(plan.temporalAudit) : Promise.resolve([]),
  ]);
  if (counts.duplicates > 0) {
    return failResult('VIN_GRAIN_VIOLATION',
      `duplicate VIN detected: ${counts.duplicates}`, input);
  }
  const groupedTotal = numericRow(groupedTotalRows, 'total');
  if (groupedTotal !== counts.used) {
    return failResult('AGGREGATION_RECONCILIATION_FAILURE',
      'group totals do not match used rows', input);
  }
  const coverage = calculateCoverage(
    counts.source, counts.eligible, counts.universe, counts.filtered, counts.used);
  if (coverage.reconciliation.status === 'FAIL') {
    return failResult('UNIVERSE_RECONCILIATION_FAILURE',
      'universe reconciliation failed', input);
  }

  const checks = [vinUniverseCheck(counts.source, counts.eligible, counts.sourceAudit)];
  if (input.universe.type === 'DEALER_STOCK') checks.push(dealerStockCheck());
  if (input.time) {
    const temporalRow = temporalRows[0] || {};
    const temporal = {
      non_null:Number(temporalRow.non_null || 0),
      parsed:Number(temporalRow.parsed || 0),
      invalid:Number(temporalRow.invalid || 0),
      null:Number(temporalRow.null || 0),
    };
    checks.push(timeRoleCheck(input.time.role));
    checks.push(temporalParseCheck(input.time.role, temporal));
  }
  checks.push({
    name:'Universe Reconciliation',
    status:'PASS',
    equations:coverage.reconciliation.equations,
  });
  checks.push({
    name:'Aggregation Reconciliation',
    status:'PASS',
    expected:counts.used,
    actual:groupedTotal,
  });

  const { status, warnings } = resultStatus(checks);
  const groups = numericRow(groupCountRows, 'groups');
  return {
    ok:true,
    status,
    cube:{ name:VIN_CUBE.name, version:VIN_CUBE.version },
    query:input,
    result:{
      rows:resultRows,
      totals:input.options?.include_totals === false
        ? {} : { [plan.measureAlias]:counts.used },
      rows_returned:resultRows.length,
      has_more:plan.offset + resultRows.length < groups,
    },
    coverage:coverageOutput(input, coverage),
    audit:{ status, checks },
    warnings,
    lineage:lineageOutput(input, { sql:true, identity:'all' }),
  };
}
