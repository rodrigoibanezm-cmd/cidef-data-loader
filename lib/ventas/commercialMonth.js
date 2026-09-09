const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function assertMonth(month) {
  const value = String(month || '');
  if (!MONTH_RE.test(value)) throw new Error('commercial month must use YYYY-MM');
  return value;
}

function shiftMonth(month, offset) {
  const value = assertMonth(month);
  const [year, monthNumber] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function asUtcDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('date must be valid');
    return value;
  }
  const raw = String(value || '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new Error('date must use YYYY-MM-DD');
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y)
    || date.getUTCMonth() !== Number(m) - 1
    || date.getUTCDate() !== Number(d)
  ) throw new Error('date must use valid YYYY-MM-DD');
  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function commercialMonthDays(month) {
  const value = assertMonth(month);
  const [year, monthNumber] = value.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function commercialMonthRange(month) {
  const value = assertMonth(month);
  const nextMonth = shiftMonth(value, 1);
  const start = new Date(`${value}-02T00:00:00.000Z`);
  const end = new Date(`${nextMonth}-01T23:59:59.999Z`);
  return {
    month: value,
    start,
    end,
    start_date: formatDate(start),
    end_date: formatDate(end),
    days: commercialMonthDays(value),
  };
}

export function commercialMonthForDate(value) {
  const date = asUtcDate(value);
  const calendarMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return date.getUTCDate() === 1 ? shiftMonth(calendarMonth, -1) : calendarMonth;
}

export function commercialDayForDate(value) {
  const date = asUtcDate(value);
  const month = commercialMonthForDate(date);
  const { start } = commercialMonthRange(month);
  const calendarDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((calendarDay - start.getTime()) / DAY_MS) + 1;
}

export function commercialDateForDay(month, day) {
  const range = commercialMonthRange(month);
  const value = Number(day);
  if (!Number.isInteger(value) || value < 1 || value > range.days) {
    throw new Error(`commercial day must be between 1 and ${range.days}`);
  }
  return formatDate(new Date(range.start.getTime() + (value - 1) * DAY_MS));
}
