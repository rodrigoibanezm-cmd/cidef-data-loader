import { shiftMonth } from '../expectation/monthSeries.js';
import { calculateShareMetrics } from './shareMetrics.js';

function commonRows(rows, candidateNames) {
  return rows.filter((row) => candidateNames.every(
    (name) => row.predictions[name]?.evaluable === true,
  ));
}

function summarizeWindow(label, rows, candidateNames) {
  const common = commonRows(rows, candidateNames);
  return candidateNames.map((candidate) => ({
    label,
    candidate,
    target_rows: rows.length,
    common_evaluable_rows: common.length,
    ...calculateShareMetrics(common, candidate),
  }));
}

export function buildTemporalStability(rows, candidateNames) {
  const years = [...new Set(rows.map((row) => row.month.slice(0, 4)))].sort();
  const calendarYears = years.flatMap((year) => summarizeWindow(
    year,
    rows.filter((row) => row.month.startsWith(`${year}-`)),
    candidateNames,
  ));

  const rolling12 = [];
  const months = [...new Set(rows.map((row) => row.month))].sort();
  for (const endMonth of months) {
    const startMonth = shiftMonth(endMonth, -11);
    if (!startMonth || startMonth < months[0]) continue;
    const scoped = rows.filter((row) => row.month >= startMonth && row.month <= endMonth);
    rolling12.push(...summarizeWindow(
      `${startMonth}..${endMonth}`,
      scoped,
      candidateNames,
    ));
  }
  return { calendar_years: calendarYears, rolling_12_months: rolling12 };
}
