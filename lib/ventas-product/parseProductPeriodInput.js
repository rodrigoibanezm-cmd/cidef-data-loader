import { shiftMonth } from '../expectation/monthSeries.js';

export function parseProductPeriodInput(input = {}) {
  const modeloId = Number(input?.modelo_id);
  const startMonth = String(input?.start_month || '');
  const endMonth = String(input?.end_month || '');
  const cutoffMonth = String(input?.cutoff_month || '');

  if (!Number.isInteger(modeloId) || modeloId < 1) throw new Error('Invalid modelo_id');
  if (!shiftMonth(startMonth, 0)) throw new Error('Invalid start_month; expected YYYY-MM');
  if (!shiftMonth(endMonth, 0)) throw new Error('Invalid end_month; expected YYYY-MM');
  if (!shiftMonth(cutoffMonth, 0)) throw new Error('Invalid cutoff_month; expected YYYY-MM');
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  if (cutoffMonth !== endMonth) throw new Error('cutoff_month must equal end_month');

  return { modeloId, startMonth, endMonth, cutoffMonth };
}
