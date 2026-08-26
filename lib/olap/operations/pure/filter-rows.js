import { VIN_CUBE } from '../../vin-cube-registry.js';
import { auditTemporal } from '../../vin-auditors.js';
import { dimensionValue } from '../../semantics/dimensions.js';
import { passesFilter } from '../../semantics/filters.js';
import { parseIsoDate, parseSourceDate } from '../../semantics/time.js';
import { temporalParseCheck, timeRoleCheck } from '../../output/audit-checks.js';

export function applySemanticFilters(rows, filters, dealers) {
  let filtered = rows;
  for (const filter of filters || []) {
    const dimension = { name:filter.field.name, level:filter.field.level };
    filtered = filtered.filter((row) =>
      passesFilter(dimensionValue(row, dimension, dealers), filter));
  }
  return filtered;
}

export function applyAggregateTime(input, rows, checks) {
  if (!input.time) return rows;
  const column = VIN_CUBE.timeRoles[input.time.role];
  const temporal = auditTemporal(rows.map((row) => row[column]), parseSourceDate);
  checks.push(timeRoleCheck(input.time.role));
  checks.push(temporalParseCheck(input.time.role, temporal));
  const from = parseIsoDate(input.time.from);
  const to = parseIsoDate(input.time.to);
  return rows.filter((row) => {
    const parsed = parseSourceDate(row[column]);
    return parsed.status === 'parsed'
      && (!from || parsed.date >= from)
      && (!to || parsed.date <= to);
  });
}
