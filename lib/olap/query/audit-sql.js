import { VIN_CUBE } from '../vin-cube-registry.js';
import { dateSql } from '../semantics/time.js';
import { eligibleVinSql, quoteIdentifier } from './sql-utils.js';

const source = () => quoteIdentifier(VIN_CUBE.source);
const fact = () => `i.${quoteIdentifier(VIN_CUBE.fact.key)}`;

export function sourceAuditSql() {
  return `SELECT COUNT(*)::int source_rows, COUNT(*) FILTER (WHERE ${fact()} IS NULL)::int null_vin, COUNT(*) FILTER (WHERE ${fact()} IS NOT NULL AND TRIM(${fact()}::text)='')::int blank_vin FROM ${source()} i`;
}

export function duplicateAuditSql() {
  return `SELECT COUNT(*)::int duplicate_vin FROM (SELECT TRIM(${fact()}::text) vin FROM ${source()} i WHERE ${eligibleVinSql()} GROUP BY 1 HAVING COUNT(*)>1) x`;
}

export function eligibleCountSql() {
  return `SELECT COUNT(*)::int eligible_vin FROM ${source()} i WHERE ${eligibleVinSql()}`;
}

export function temporalAuditSql(input, from, where = eligibleVinSql()) {
  if (!input.time) return null;
  const raw = `i.${quoteIdentifier(VIN_CUBE.timeRoles[input.time.role])}`;
  const parsed = dateSql(raw);
  return `SELECT COUNT(*) FILTER (WHERE NULLIF(TRIM(${raw}::text),'') IS NOT NULL)::int non_null, COUNT(*) FILTER (WHERE NULLIF(TRIM(${raw}::text),'') IS NULL)::int null, COUNT(*) FILTER (WHERE NULLIF(TRIM(${raw}::text),'') IS NOT NULL AND ${parsed} IS NOT NULL)::int parsed, COUNT(*) FILTER (WHERE NULLIF(TRIM(${raw}::text),'') IS NOT NULL AND ${parsed} IS NULL)::int invalid FROM ${from} WHERE ${where}`;
}
