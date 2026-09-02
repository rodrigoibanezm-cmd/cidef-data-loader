import { shiftMonth } from '../expectation/monthSeries.js';

const ALLOWED_KEYS = new Set(['start_month', 'end_month', 'pareto_threshold_pct']);

function currentMonthSantiago(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function parseConcentrationInput(input = {}, now = new Date()) {
  const unsupported = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key));
  if (unsupported.length) throw new Error(`Unsupported input(s): ${unsupported.join(', ')}`);

  const startMonth = String(input.start_month || '');
  const endMonth = String(input.end_month || '');
  if (!shiftMonth(startMonth, 0) || !shiftMonth(endMonth, 0)) {
    throw new Error('start_month and end_month must use YYYY-MM');
  }
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  if (endMonth >= currentMonthSantiago(now)) {
    throw new Error('end_month must be a closed calendar month in America/Santiago');
  }

  const thresholdPct = input.pareto_threshold_pct == null ? 80 : Number(input.pareto_threshold_pct);
  if (!Number.isFinite(thresholdPct) || thresholdPct <= 0 || thresholdPct > 100) {
    throw new Error('pareto_threshold_pct must be > 0 and <= 100');
  }
  return { startMonth, endMonth, thresholdPct };
}
