const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const PERIOD_KINDS = new Set(['MONTH', 'YEAR', 'YTD', 'CUSTOM_RANGE']);
const TIME_GRAINS = new Set(['MONTH', 'YEAR']);

function validDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function lastDayOfMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function durationDays(period) {
  return Math.round((Date.parse(`${period.date_to}T00:00:00Z`) - Date.parse(`${period.date_from}T00:00:00Z`)) / 86400000) + 1;
}

export function normalizePeriod(value) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_PERIOD');
  const kind = String(value.kind || value.period_kind || '').toUpperCase();
  if (!PERIOD_KINDS.has(kind)) throw new Error('INVALID_PERIOD');
  if (kind === 'MONTH') {
    const month = String(value.month || '');
    if (!MONTH_RE.test(month)) throw new Error('INVALID_PERIOD');
    const dateFrom = `${month}-01`;
    const dateTo = lastDayOfMonth(month);
    if (!validDate(dateFrom) || !validDate(dateTo)) throw new Error('INVALID_PERIOD');
    return { period_kind: kind, label: month, date_from: dateFrom, date_to: dateTo };
  }
  if (kind === 'YEAR') {
    const year = Number(value.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error('INVALID_PERIOD');
    const dateTo = `${year}-12-31`;
    const today = new Date().toISOString().slice(0, 10);
    if (dateTo > today) throw new Error('INVALID_PERIOD');
    return { period_kind: kind, label: String(year), date_from: `${year}-01-01`, date_to: dateTo };
  }
  if (kind === 'YTD') {
    const year = Number(value.year);
    const throughDate = value.through_date;
    if (!Number.isInteger(year) || !validDate(throughDate) || !String(throughDate).startsWith(`${year}-`)) throw new Error('INVALID_PERIOD');
    return { period_kind: kind, label: `${year}-YTD@${throughDate}`, date_from: `${year}-01-01`, date_to: throughDate };
  }
  if (!validDate(value.date_from) || !validDate(value.date_to) || value.date_from > value.date_to) throw new Error('INVALID_PERIOD');
  return { period_kind: kind, label: `${value.date_from}/${value.date_to}`, date_from: value.date_from, date_to: value.date_to };
}

export function parseTimeGrain(value) {
  const normalized = String(value || 'MONTH').toUpperCase();
  if (!TIME_GRAINS.has(normalized)) throw new Error('INVALID_PERIOD');
  return normalized;
}

export function comparePeriods(a, b) {
  const labels = [];
  if (a.period_kind === 'YTD' && b.period_kind === 'YTD') labels.push(a.date_to.slice(5) === b.date_to.slice(5) ? 'SAME_YTD_BOUNDARY' : 'DIFFERENT_YTD_BOUNDARY');
  const aWindow = `${a.date_from.slice(5)}/${a.date_to.slice(5)}`;
  const bWindow = `${b.date_from.slice(5)}/${b.date_to.slice(5)}`;
  if (aWindow === bWindow) labels.push('SAME_CALENDAR_WINDOW');
  labels.push(durationDays(a) === durationDays(b) ? 'SAME_DURATION' : 'DIFFERENT_DURATION');
  return labels;
}
