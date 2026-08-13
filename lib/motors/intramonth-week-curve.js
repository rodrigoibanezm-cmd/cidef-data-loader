import { rvmDb } from '../rvm-db.js';
import { seasonalityInput, seasonalityParams } from '../seasonality-input.js';
import { cidefCoverageSql, seasonalityStatsSql } from '../seasonality-source-sql.js';
import { intramonthWeekSql } from '../intramonth-week-sql.js';
import { weekSeriesOutput, weekSummaryOutput } from '../intramonth-week-output.js';
import { coverageOutput, paginationOutput } from '../seasonality-result.js';

export async function execute(input = {}, sql) {
  const filters = seasonalityInput(input);
  const params = seasonalityParams(filters);
  const sourceParams = params.slice(0, filters.scope === 'CIDEF' ? 6 : 4);
  const [stats] = await sql.query(seasonalityStatsSql(filters), sourceParams);
  if (!stats?.date_from) throw new Error('No RVM rows match the requested filters');
  const rows = await sql.query(intramonthWeekSql(filters), params);
  const coverage = filters.scope === 'CIDEF'
    ? coverageOutput((await sql.query(cidefCoverageSql(filters), params.slice(0, 4)))[0]) : null;
  const series = weekSeriesOutput(rows);
  return {
    scope: filters.scope, group_by: filters.group_by,
    periodo: { desde: stats.date_from, hasta: stats.date_to }, coverage,
    pagination: paginationOutput(filters, stats.total_groups),
    summary: weekSummaryOutput(series), series,
  };
}

export async function run(input = {}) {
  return execute(input, rvmDb());
}
