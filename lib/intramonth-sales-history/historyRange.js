import { monthRange } from '../daily-close-backtest/monthRange.js';
import { commercialMonthForDate, commercialMonthRange } from '../ventas/commercialMonth.js';

const ALLOWED_KEYS = new Set(['start_month', 'end_month', 'output_mode', 'milestone_days']);
const DEFAULT_MILESTONE_DAYS = Object.freeze([15, 18, 20, 22, 25]);
const OUTPUT_MODES = new Set(['MONTHLY_MILESTONES', 'DAILY']);

function parseOutputMode(value) {
  const mode = String(value ?? 'MONTHLY_MILESTONES').trim().toUpperCase();
  if (!OUTPUT_MODES.has(mode)) {
    throw new Error('output_mode must be MONTHLY_MILESTONES or DAILY');
  }
  return mode;
}

function parseMilestoneDays(value) {
  const days = value == null ? [...DEFAULT_MILESTONE_DAYS] : value;
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error('milestone_days must be a non-empty array');
  }
  const normalized = [...new Set(days.map(Number))];
  if (normalized.some((day) => !Number.isInteger(day) || day < 1 || day > 31)) {
    throw new Error('milestone_days must contain integers between 1 and 31');
  }
  return normalized.sort((a, b) => a - b);
}

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
    outputMode: parseOutputMode(input.output_mode),
    milestoneDays: parseMilestoneDays(input.milestone_days),
  };
}
