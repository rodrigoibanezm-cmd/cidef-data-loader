import { shiftMonth } from '../expectation/monthSeries.js';

const ALLOWED_KEYS = new Set(['period_a', 'period_b']);

function currentMonthSantiago(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function parseProductChangeInput(input = {}, now = new Date()) {
  const unsupported = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key));
  if (unsupported.length) throw new Error(`Unsupported input(s): ${unsupported.join(', ')}`);

  const periodA = String(input.period_a || '');
  const periodB = String(input.period_b || '');
  if (!shiftMonth(periodA, 0) || !shiftMonth(periodB, 0)) {
    throw new Error('period_a and period_b must use YYYY-MM');
  }
  if (periodA >= periodB) throw new Error('period_a must be before period_b');

  const openMonth = currentMonthSantiago(now);
  if (periodA >= openMonth || periodB >= openMonth) {
    throw new Error('period_a and period_b must be closed calendar months in America/Santiago');
  }
  return { periodA, periodB, cutoffMonth: periodB };
}
