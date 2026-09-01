import { buildSalesIndex, shiftMonth } from './monthSeries.js';

function assertMonth(value, name) {
  if (shiftMonth(value, 0) !== value) throw new Error(`${name} must use YYYY-MM format`);
}

export function buildExpectationInput(monthlySales, cutoffMonth, targetMonth) {
  assertMonth(cutoffMonth, 'cutoff_month');
  assertMonth(targetMonth, 'target_month');

  if (shiftMonth(cutoffMonth, 1) !== targetMonth) {
    throw new Error('target_month must be the month immediately after cutoff_month');
  }

  const available = (monthlySales || []).filter((row) => row.month <= cutoffMonth);
  const futureRows = (monthlySales || []).filter((row) => row.month > cutoffMonth).length;

  return {
    cutoff_month: cutoffMonth,
    target_month: targetMonth,
    monthly_sales: available,
    sales_index: buildSalesIndex(available),
    future_rows_removed: futureRows,
  };
}
