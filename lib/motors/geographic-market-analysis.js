import { rvmDb } from '../rvm-db.js';
import { geographicMarketInput, geographicPeriods, shiftMonth } from '../geographic-market-input.js';
import { analysisParams, geographyPageSql } from '../geographic-market-base-sql.js';
import { geographicSummarySql } from '../geographic-market-summary-sql.js';
import { geographicSeriesSql } from '../geographic-market-series-sql.js';
import { seriesOutput, summaryOutput } from '../geographic-market-output.js';

export async function execute(input = {}, sql) {
  const filters = geographicMarketInput(input);
  const [available] = await sql.query(`SELECT
    to_char(date_trunc('month',MAX(fecha)),'YYYY-MM') AS latest_month
    FROM rvm_raw WHERE fecha IS NOT NULL`);
  if (!available?.latest_month) throw new Error('rvm_raw has no dated rows');
  const endMonth = filters.end_month || available.latest_month;
  if (endMonth > available.latest_month) throw new Error('end_month exceeds latest RVM month');
  const periods = geographicPeriods(endMonth, filters.months, filters.comparison);
  const pageRows = await sql.query(geographyPageSql(filters.level), [
    `${periods.current.desde}-01`, `${shiftMonth(periods.current.hasta, 1)}-01`,
    filters.universe, filters.segment, filters.page_size,
    (filters.page - 1) * filters.page_size,
  ]);
  const total = pageRows[0] ? Number(pageRows[0].total_geographies) : 0;
  const geographies = pageRows.map(row => row.geography);
  const params = analysisParams(periods, geographies, filters);
  const summaryRows = geographies.length
    ? await sql.query(geographicSummarySql(filters.level), params) : [];
  const seriesRows = geographies.length
    ? await sql.query(geographicSeriesSql(filters.level), params) : [];
  return {
    level: filters.level, universe: filters.universe, brand: filters.brand,
    segment: filters.segment, months: filters.months, comparison: filters.comparison,
    periodo_actual: periods.current, periodo_comparacion: periods.previous,
    pagination: {
      page: filters.page, page_size: filters.page_size,
      total_geographies: total, total_pages: Math.ceil(total / filters.page_size),
    },
    summary: summaryOutput(summaryRows, Boolean(periods.previous)),
    series: seriesOutput(seriesRows),
  };
}

export async function run(input = {}) {
  return execute(input, rvmDb());
}
