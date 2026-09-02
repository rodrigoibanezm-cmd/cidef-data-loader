import { currentDateSantiago } from '../intramonth-sales-history/historyRange.js';
import { parseVentasCutoff } from '../ventas/parseVentasCutoff.js';

const ALLOWED_KEYS = new Set(['cutoff_date']);

export function parseLiveCutoff(input = {}, now = new Date()) {
  const unsupported = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key));
  if (unsupported.length) {
    throw new Error(`Unsupported input(s) for current_month_close_forecast_v01: ${unsupported.join(', ')}`);
  }
  if (!input.cutoff_date) throw new Error('cutoff_date is required');

  const cutoff = parseVentasCutoff({ cutoffDate: input.cutoff_date }).value;
  const currentDate = currentDateSantiago(now);
  if (cutoff > currentDate) throw new Error('cutoff_date cannot be in the future');

  return {
    cutoffDate: cutoff,
    targetMonth: cutoff.slice(0, 7),
    dayOfMonth: Number(cutoff.slice(8, 10)),
    currentDate,
  };
}
