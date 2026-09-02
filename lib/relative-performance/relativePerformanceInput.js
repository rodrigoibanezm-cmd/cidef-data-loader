import { shiftMonth } from '../expectation/monthSeries.js';

const GRAINS = new Set(['tienda', 'vendedor']);
const ALLOWED_KEYS = new Set(['grain', 'start_month', 'end_month']);

export function currentMonthSantiago(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function rejectUnsupportedInputs(input) {
  const unsupported = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key));
  if (unsupported.length) {
    throw new Error(`Unsupported input(s) for organizational_relative_performance_v01: ${unsupported.join(', ')}`);
  }
}

export function parseRelativePerformanceInput(input = {}) {
  rejectUnsupportedInputs(input);
  const grain = String(input.grain || '');
  const startMonth = String(input.start_month || '');
  const endMonth = String(input.end_month || '');
  if (!GRAINS.has(grain)) throw new Error('grain must be tienda or vendedor');
  if (!shiftMonth(startMonth, 0) || !shiftMonth(endMonth, 0)) {
    throw new Error('start_month and end_month must use YYYY-MM');
  }
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  const currentMonth = currentMonthSantiago();
  if (endMonth >= currentMonth) {
    throw new Error('end_month must be a closed calendar month in America/Santiago');
  }
  return { grain, startMonth, endMonth, currentMonth };
}
