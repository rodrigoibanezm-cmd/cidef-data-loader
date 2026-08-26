import { VIN_CUBE } from '../vin-cube-registry.js';
import { sourceFromSql } from '../semantics/dimensions.js';
import { semanticFilterSql } from '../semantics/filters.js';
import { dateSql } from '../semantics/time.js';
import { universeSqlParts } from '../semantics/universes.js';
import { eligibleVinSql, quoteIdentifier } from './sql-utils.js';
import { duplicateAuditSql, eligibleCountSql, sourceAuditSql, temporalAuditSql } from './audit-sql.js';

function boundaryExpression(input, parsedDate) {
  const aggregate = input.boundary;
  if (input.time.grain === 'quarter') {
    return `CASE WHEN ${aggregate}(${parsedDate}) IS NULL THEN NULL ELSE TO_CHAR(${aggregate}(${parsedDate}),'YYYY') || '-Q' || EXTRACT(QUARTER FROM ${aggregate}(${parsedDate}))::int END`;
  }
  const format = { day:'YYYY-MM-DD', month:'YYYY-MM', year:'YYYY' }[input.time.grain];
  return `TO_CHAR(${aggregate}(${parsedDate}),'${format}')`;
}

export function buildTemporalBoundarySqlPlan(input) {
  const values = [];
  const universe = universeSqlParts(input.universe);
  const semanticFilters = semanticFilterSql(input, values);
  const from = sourceFromSql(input);
  const eligible = eligibleVinSql();
  const filteredWhere = [eligible, ...universe, ...semanticFilters].join(' AND ');
  const timeColumn = `i.${quoteIdentifier(VIN_CUBE.timeRoles[input.time.role])}`;
  const parsedDate = dateSql(timeColumn);
  const usedWhere = `${filteredWhere} AND ${parsedDate} IS NOT NULL`;
  const universeWhere = [eligible, ...universe].join(' AND ');
  return {
    values,
    sourceAudit:sourceAuditSql(),
    duplicateAudit:duplicateAuditSql(),
    eligibleCount:eligibleCountSql(),
    universeCount:`SELECT COUNT(*)::int universe_rows FROM ${from} WHERE ${universeWhere}`,
    filteredCount:`SELECT COUNT(*)::int filtered_rows FROM ${from} WHERE ${filteredWhere}`,
    usedCount:`SELECT COUNT(*)::int used_rows FROM ${from} WHERE ${usedWhere}`,
    boundary:`SELECT ${boundaryExpression(input, parsedDate)} AS boundary FROM ${from} WHERE ${usedWhere}`,
    temporalAudit:temporalAuditSql(input, from, filteredWhere),
  };
}
