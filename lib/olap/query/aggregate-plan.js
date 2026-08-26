import { VIN_CUBE } from '../vin-cube-registry.js';
import { dimensionSql, sourceFromSql } from '../semantics/dimensions.js';
import { semanticFilterSql } from '../semantics/filters.js';
import { timeGrainSql, timeRoleSql } from '../semantics/time.js';
import { universeSqlParts } from '../semantics/universes.js';
import { eligibleVinSql, pushSqlValue, quoteIdentifier } from './sql-utils.js';
import { duplicateAuditSql, eligibleCountSql, sourceAuditSql, temporalAuditSql } from './audit-sql.js';

function filteredParts(input, values) {
  const parts = [...universeSqlParts(input.universe)];
  if (input.time) {
    const date = timeRoleSql(input.time.role);
    parts.push(`${date} IS NOT NULL`);
    if (input.time.from) parts.push(`${date} >= ${pushSqlValue(values, input.time.from)}::date`);
    if (input.time.to) parts.push(`${date} <= ${pushSqlValue(values, input.time.to)}::date`);
  }
  return [...parts, ...semanticFilterSql(input, values)];
}

function dimensions(input) {
  const result = (input.dimensions || []).map((dimension) => ({
    alias:dimension.as || dimension.name,
    expr:dimensionSql(dimension),
  }));
  const time = timeGrainSql(input.time);
  if (time) result.push({ alias:'time', expr:time });
  return result;
}

function agingMetrics(input, values) {
  return (input.derived_metrics || []).map((metric) => {
    const stockEntry = timeRoleSql('STOCK_ENTRY');
    const base = `(${pushSqlValue(values, metric.as_of_date)}::date - ${stockEntry})`;
    return {
      alias:metric.as || `${metric.name}_${metric.aggregation.toLowerCase()}`,
      expr:`${metric.aggregation}(${base}) FILTER (WHERE ${stockEntry} IS NOT NULL)`,
    };
  });
}

export function buildAggregateSqlPlan(input) {
  const values = [];
  const filters = filteredParts(input, values);
  const filterValues = [...values];
  const where = [eligibleVinSql(), ...filters].join(' AND ');
  const from = sourceFromSql(input);
  const dims = dimensions(input);
  const aging = agingMetrics(input, values);
  const selectDims = dims.map((d) => `COALESCE(${d.expr}::text,'__MISSING__') AS ${quoteIdentifier(d.alias)}`);
  const groupBy = dims.map((d) => d.expr);
  const measureAlias = input.measures[0].as || 'unit_count';
  const select = [...selectDims, `COUNT(*)::int AS ${quoteIdentifier(measureAlias)}`,
    ...aging.map((metric) => `${metric.expr} AS ${quoteIdentifier(metric.alias)}`)];
  const grouped = `SELECT ${select.join(', ')} FROM ${from} WHERE ${where}${groupBy.length ? ` GROUP BY ${groupBy.join(', ')}` : ''}`;
  const limit = Math.max(1, Math.min(Number(input.options?.limit) || 300, 2000));
  const offset = Math.max(0, Number(input.options?.offset) || 0);
  const universeWhere = [eligibleVinSql(), ...universeSqlParts(input.universe)].join(' AND ');
  const order = dims.length
    ? dims.map((d) => quoteIdentifier(d.alias)).join(', ') : quoteIdentifier(measureAlias);
  return {
    values,
    filterValues,
    rows:`${grouped} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    groupCount:`SELECT COUNT(*)::int AS groups FROM (${grouped}) g`,
    groupedTotal:`SELECT COALESCE(SUM(${quoteIdentifier(measureAlias)}),0)::int AS total FROM (${grouped}) g`,
    filteredCount:`SELECT COUNT(*)::int AS filtered_rows FROM ${from} WHERE ${where}`,
    usedCount:`SELECT COUNT(*)::int AS used_rows FROM ${from} WHERE ${where}`,
    sourceAudit:sourceAuditSql(),
    duplicateAudit:duplicateAuditSql(),
    eligibleCount:eligibleCountSql(),
    universeCount:`SELECT COUNT(*)::int universe_rows FROM ${from} WHERE ${universeWhere}`,
    temporalAudit:temporalAuditSql(input, `${quoteIdentifier(VIN_CUBE.source)} i`),
    limit,
    offset,
    measureAlias,
  };
}
