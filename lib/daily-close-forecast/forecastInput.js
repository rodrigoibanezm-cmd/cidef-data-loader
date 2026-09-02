import { shiftMonth } from '../expectation/monthSeries.js';
import { parseVentasCutoff } from '../ventas/parseVentasCutoff.js';

function santiagoDate(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function parseDailyCloseForecastInput(input = {}, now = new Date()) {
  if (!input.cutoff_date) throw new Error('cutoff_date is required');
  const cutoff = parseVentasCutoff({ cutoffDate: input.cutoff_date }).value;
  const today = santiagoDate(now);
  if (cutoff > today) throw new Error('cutoff_date cannot be in the future in America/Santiago');

  const targetMonth = cutoff.slice(0, 7);
  const currentMonth = today.slice(0, 7);
  if (targetMonth !== currentMonth) {
    throw new Error('cutoff_date must belong to the current open month in America/Santiago');
  }

  return {
    cutoffDate: cutoff,
    targetMonth,
    dayOfMonth: Number(cutoff.slice(8, 10)),
    trainingEndMonth: shiftMonth(targetMonth, -1),
    today,
  };
}
