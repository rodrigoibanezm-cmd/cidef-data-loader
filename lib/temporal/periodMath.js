export const CIDEF_TIMEZONE = 'America/Santiago';

function pad(value) { return String(value).padStart(2, '0'); }
function iso(year, month, day) { return `${year}-${pad(month)}-${pad(day)}`; }
function endDay(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function addMonths(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year:d.getUTCFullYear(), month:d.getUTCMonth() + 1 };
}
function localDate(now, timezone) {
  if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)) {
    const [year, month, day] = now.split('-').map(Number);
    return { year, month, day };
  }
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw Object.assign(new Error('INVALID_NOW'), { code:'INVALID_NOW' });
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(date);
  const value = type => Number(parts.find(part => part.type === type)?.value);
  return { year:value('year'), month:value('month'), day:value('day') };
}
function monthCount(dateFrom, dateTo) {
  const [sy,sm,sd] = dateFrom.split('-').map(Number);
  const [ey,em,ed] = dateTo.split('-').map(Number);
  if (sd !== 1 || ed !== endDay(ey,em)) return null;
  const count = (ey-sy)*12 + (em-sm) + 1;
  return count > 0 ? count : null;
}
function monthRange(year, month) {
  return { date_from:iso(year,month,1), date_to:iso(year,month,endDay(year,month)) };
}
function previousMonthRange(today) {
  const previous = addMonths(today.year,today.month,-1);
  return monthRange(previous.year,previous.month);
}
function previousQuarterRange(today) {
  const currentQuarterMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
  const start = addMonths(today.year,currentQuarterMonth,-3);
  return {
    date_from:iso(start.year,start.month,1),
    date_to:iso(start.year,start.month + 2,endDay(start.year,start.month + 2)),
  };
}
function sameRange(dateFrom,dateTo,range) {
  return dateFrom === range.date_from && dateTo === range.date_to;
}
function classifyRange(dateFrom, dateTo, today) {
  const todayIso = iso(today.year,today.month,today.day);
  const currentMonthStart = iso(today.year,today.month,1);
  const currentQuarterStart = iso(today.year,Math.floor((today.month-1)/3)*3+1,1);
  const currentYearStart = iso(today.year,1,1);
  if (dateTo === todayIso && dateFrom === currentMonthStart) return 'CURRENT_MTD';
  if (dateTo === todayIso && dateFrom === currentQuarterStart) return 'CURRENT_QUARTER_TO_DATE';
  if (dateTo === todayIso && dateFrom === currentYearStart) return 'YTD';

  const count = monthCount(dateFrom,dateTo);
  if (dateTo < todayIso && count === 1) {
    return sameRange(dateFrom,dateTo,previousMonthRange(today)) ? 'LAST_CLOSED_MONTH' : 'EXPLICIT_MONTH';
  }
  if (dateTo < todayIso && count === 3 && [1,4,7,10].includes(Number(dateFrom.slice(5,7)))) {
    return sameRange(dateFrom,dateTo,previousQuarterRange(today)) ? 'LAST_CLOSED_QUARTER' : 'EXPLICIT_QUARTER';
  }
  if (dateTo < todayIso && count && count > 1) {
    const previousMonth = previousMonthRange(today);
    return dateTo === previousMonth.date_to ? 'LAST_N_CLOSED_MONTHS' : 'EXPLICIT_RANGE';
  }
  if (dateTo === todayIso && dateFrom.endsWith('-01') && dateFrom < currentMonthStart) return 'ROLLING_MONTHS_INCLUDING_OPEN';
  if (dateTo < todayIso && dateFrom.endsWith('-01')) {
    const [year,month] = dateTo.split('-').map(Number);
    if (dateFrom === `${year}-01-01` && dateTo === `${year}-12-31`) return 'EXPLICIT_YEAR';
  }
  return 'EXPLICIT_RANGE';
}

export function deriveTemporalMetadata(period, options={}) {
  const timezone = options.timezone ?? CIDEF_TIMEZONE;
  const today = localDate(options.now ?? new Date(), timezone);
  const todayIso = iso(today.year,today.month,today.day);
  const { date_from, date_to } = period;
  const period_status = date_to < todayIso ? 'CLOSED' : 'PARTIAL';
  const cutoff_mode = period_status === 'CLOSED' ? 'FULL_PERIOD' : 'SAME_DAY';
  const fullMonths = monthCount(date_from,date_to);
  return {
    type: classifyRange(date_from,date_to,today),
    date_from,
    date_to,
    period_status,
    cutoff_mode,
    timezone,
    calendar_shape: {
      full_calendar_months: fullMonths,
      contains_current_date: date_from <= todayIso && date_to >= todayIso,
      ends_on_current_date: date_to === todayIso,
    },
  };
}

export function previousYearPeriod(base) {
  if (!base?.date_from || !base?.date_to) throw new Error('BASE_PERIOD_REQUIRED');
  const shift = value => {
    const [year,month,day] = value.split('-').map(Number);
    const targetYear = year - 1;
    return iso(targetYear,month,Math.min(day,endDay(targetYear,month)));
  };
  return { date_from:shift(base.date_from), date_to:shift(base.date_to) };
}
