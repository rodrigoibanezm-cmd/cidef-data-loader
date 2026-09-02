const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthIndex(month) {
  const [year, value] = month.split('-').map(Number);
  return year * 12 + value - 1;
}

function formatMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthDays(month) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

export function monthRange(startMonth, endMonth) {
  if (!MONTH_RE.test(String(startMonth || ''))) throw new Error('start_month must use YYYY-MM');
  if (!MONTH_RE.test(String(endMonth || ''))) throw new Error('end_month must use YYYY-MM');
  const start = monthIndex(startMonth);
  const end = monthIndex(endMonth);
  if (end < start) throw new Error('end_month must be >= start_month');
  if (end - start + 1 > 84) throw new Error('month range exceeds 84 months');
  return Array.from({ length: end - start + 1 }, (_, offset) => formatMonth(start + offset));
}

export function assertClosedRange(startMonth, endMonth, now = new Date()) {
  const months = monthRange(startMonth, endMonth);
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  if (endMonth >= currentMonth) throw new Error('end_month must be a closed month');
  return months;
}

export function calendarDate(month, day) {
  return `${month}-${String(day).padStart(2, '0')}`;
}
