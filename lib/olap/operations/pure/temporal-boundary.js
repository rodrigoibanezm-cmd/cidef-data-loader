import { VIN_CUBE } from '../../vin-cube-registry.js';
import { auditTemporal } from '../../vin-auditors.js';
import { boundaryCheck, temporalParseCheck, timeRoleCheck, universeCheck } from '../../output/audit-checks.js';
import { calculateCoverage, coverageOutput } from '../../output/coverage.js';
import { lineageOutput } from '../../output/lineage.js';
import { failResult } from '../../output/result-envelope.js';
import { dateKey, parseSourceDate } from '../../semantics/time.js';
import { preparePureContext } from './context.js';
import { applySemanticFilters } from './filter-rows.js';

function selectBoundary(input, used) {
  const dates = used.map(({ parsed }) => parsed.date);
  if (!dates.length) return null;
  const timestamp = input.boundary === 'MIN'
    ? Math.min(...dates.map((date) => date.getTime()))
    : Math.max(...dates.map((date) => date.getTime()));
  return dateKey(new Date(timestamp), input.time.grain);
}

export function executePureTemporalBoundary(input, sourceRows, dealerRows) {
  const context = preparePureContext(input, sourceRows, dealerRows);
  if (context.error) return context.error;
  const { eligible, universe, dealers, checks } = context;
  const filtered = applySemanticFilters(universe, input.filters, dealers);
  const timeColumn = VIN_CUBE.timeRoles[input.time.role];
  const temporal = auditTemporal(filtered.map((row) => row[timeColumn]), parseSourceDate);
  const used = filtered
    .map((row) => ({ row, parsed:parseSourceDate(row[timeColumn]) }))
    .filter(({ parsed }) => parsed.status === 'parsed');
  const boundary = selectBoundary(input, used);
  const counts = calculateCoverage(
    sourceRows.length, eligible.length, universe.length, filtered.length, used.length);
  if (counts.reconciliation.status === 'FAIL') {
    return failResult('UNIVERSE_RECONCILIATION_FAILURE',
      'universe reconciliation failed', input);
  }

  checks.push(timeRoleCheck(input.time.role));
  checks.push(temporalParseCheck(input.time.role, temporal));
  checks.push(universeCheck(counts.reconciliation));
  checks.push(boundaryCheck(input, used.length, boundary));
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
    coverage:coverageOutput(input, counts),
    audit:{ status, checks },
    warnings,
    lineage:lineageOutput(input, {
      operation:'TEMPORAL_BOUNDARY',
      identity:'none',
    }),
  };
}
