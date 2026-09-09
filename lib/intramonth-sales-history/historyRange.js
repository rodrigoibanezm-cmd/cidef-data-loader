import { monthRange } from '../daily-close-backtest/monthRange.js';
import { commercialMonthForDate, commercialMonthRange } from '../ventas/commercialMonth.js';

const ALLOWED_KEYS = new Set(['start_month', 'end_month']);

export function currentDateSantiago(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function parseHistoryRange(input = {}, now = new Date()) {
  const unsupported = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key));
  if (unsupported.length) {
    throw new Error(`Unsupported input(s) for intramonth_sales_history_context_v01: ${unsupported.join(', ')}`);
  }

  const startMonth = String(input.start_month || '');
  const endMonth = String(input.end_month || '');
  const months = monthRange(startMonth, endMonth);
  const currentDate = currentDateSantiago(now);
  const currentMonth = commercialMonthForDate(currentDate);
  if (endMonth > currentMonth) throw new Error('end_month cannot be in the future');

  const observableThrough = endMonth === currentMonth
    ? currentDate
    : commercialMonthRange(endMonth).end_date;

  return {
    startMonth,
    endMonth,
    months,
    currentDate,
    currentMonth,
    observableThrough,
  };
}
