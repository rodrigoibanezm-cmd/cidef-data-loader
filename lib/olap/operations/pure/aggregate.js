import { VIN_CUBE } from '../../vin-cube-registry.js';
import { reconcileAggregation } from '../../vin-auditors.js';
import { calculateCoverage, coverageOutput } from '../../output/coverage.js';
import { lineageOutput } from '../../output/lineage.js';
import { failResult, resultStatus } from '../../output/result-envelope.js';
import { preparePureContext } from './context.js';
import { applyAggregateTime, applySemanticFilters } from './filter-rows.js';
import { groupRows } from './grouping.js';

export function executePureAggregate(input, sourceRows, dealerRows) {
  const context = preparePureContext(input, sourceRows, dealerRows);
  if (context.error) return context.error;
  const { eligible, universe, dealers, checks } = context;
  let filtered = applyAggregateTime(input, universe, checks);
  filtered = applySemanticFilters(filtered, input.filters, dealers);
  const used = filtered;

  const grouped = groupRows(used, input, dealers);
  const groupedTotal = grouped.rows.reduce((sum, row) => sum + row[grouped.measureAlias], 0);
  const aggregation = reconcileAggregation(used.length, groupedTotal);
  checks.push({ name:'Aggregation Reconciliation', ...aggregation });
  if (aggregation.status === 'FAIL') {
    return failResult('AGGREGATION_RECONCILIATION_FAILURE',
      'group totals do not match used rows', input);
  }

  const counts = calculateCoverage(
    sourceRows.length, eligible.length, universe.length, filtered.length, used.length);
  checks.push({ name:'Universe Reconciliation', ...counts.reconciliation });
  if (counts.reconciliation.status === 'FAIL') {
    return failResult('UNIVERSE_RECONCILIATION_FAILURE',
      'universe reconciliation failed', input);
  }

  const limit = Math.max(1, Math.min(Number(input.options?.limit) || 300, 2000));
  const offset = Math.max(0, Number(input.options?.offset) || 0);
  const rows = grouped.rows.slice(offset, offset + limit);
  const { status, warnings } = resultStatus(checks);
  return {
    ok:true,
    status,
    cube:{ name:VIN_CUBE.name, version:VIN_CUBE.version },
    query:input,
    result:{
      rows,
      totals:input.options?.include_totals === false
        ? {} : { [grouped.measureAlias]:used.length },
      rows_returned:rows.length,
      has_more:offset + rows.length < grouped.rows.length,
    },
    coverage:coverageOutput(input, counts),
    audit:{ status, checks },
    warnings,
    lineage:lineageOutput(input, { identity:'dimensions' }),
  };
}
