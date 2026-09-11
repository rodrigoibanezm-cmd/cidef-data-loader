export const CIDEF_TIMEZONE = 'America/Santiago';

const MONTH_NAMES = Object.freeze({
  enero: 1, january: 1,
  febrero: 2, february: 2,
  marzo: 3, march: 3,
  abril: 4, april: 4,
  mayo: 5, may: 5,
  junio: 6, june: 6,
  julio: 7, july: 7,
  agosto: 8, august: 8,
  septiembre: 9, setiembre: 9, september: 9,
  octubre: 10, october: 10,
  noviembre: 11, november: 11,
  diciembre: 12, december: 12,
});

const NUMBER_WORDS = Object.freeze({
  un: 1, uno: 1, one: 1,
  dos: 2, two: 2,
  tres: 3, three: 3,
  cuatro: 4, four: 4,
  cinco: 5, five: 5,
  seis: 6, six: 6,
  siete: 7, seven: 7,
  ocho: 8, eight: 8,
  nueve: 9, nine: 9,
  diez: 10, ten: 10,
  once: 11, eleven: 11,
  doce: 12, twelve: 12,
});

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function iso(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function endDay(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonth(year, month, offset) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function localDate(now, timezone) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_NOW');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function resolved(expression, semanticType, range, options = {}) {
  return {
    status: 'RESOLVED',
    expression,
    semantic_type: semanticType,
    date_from: range.dateFrom,
    date_to: range.dateTo,
    time_grain: options.timeGrain ?? 'MONTH',
    cutoff_mode: options.cutoffMode ?? 'FULL_PERIOD',
    timezone: options.timezone ?? CIDEF_TIMEZONE,
    complete_period_only: options.completePeriodOnly ?? true,
    period_status: options.periodStatus ?? 'CLOSED',
    ...(options.periodCount == null ? {} : { period_count: options.periodCount }),
    ...(options.comparison ? { comparison: options.comparison } : {}),
  };
}

function ambiguous(expression, timezone, reason = 'TEMPORAL_AMBIGUOUS') {
  return {
    status: 'AMBIGUOUS', expression, semantic_type: 'TEMPORAL_AMBIGUOUS',
    timezone, reason,
  };
}

function parseCount(raw) {
  const numeric = Number(raw);
  if (Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 120) return numeric;
  return NUMBER_WORDS[raw] ?? null;
}

function lastClosedMonths(count, today) {
  const end = shiftMonth(today.year, today.month, -1);
  const start = shiftMonth(end.year, end.month, -(count - 1));
  return {
    dateFrom: iso(start.year, start.month, 1),
    dateTo: iso(end.year, end.month, endDay(end.year, end.month)),
  };
}

function namedMonthRange(text, today) {
  const names = Object.keys(MONTH_NAMES).join('|');
  const match = text.match(new RegExp(`(?:entre|from) (${names})(?: de)?(?: (\\d{4}))? (?:y|and|to) (${names})(?: de)?(?: (\\d{4}))?`));
  if (!match) return null;
  const startMonth = MONTH_NAMES[match[1]];
  const endMonth = MONTH_NAMES[match[3]];
  let endYear = match[4] ? Number(match[4]) : match[2] ? Number(match[2]) : today.year;
  let startYear = match[2] ? Number(match[2]) : endYear;
  if (!match[2] && startMonth > endMonth) startYear = endYear - 1;
  const dateFrom = iso(startYear, startMonth, 1);
  const dateTo = iso(endYear, endMonth, endDay(endYear, endMonth));
  const todayIso = iso(today.year, today.month, today.day);
  if (dateTo > todayIso) return { ambiguous: true, reason: 'EXPLICIT_RANGE_EXTENDS_INTO_FUTURE' };
  return { dateFrom, dateTo };
}

export function previousYearPeriod(base) {
  if (!base?.date_from || !base?.date_to) throw new Error('BASE_PERIOD_REQUIRED');
  const shift = (value) => {
    const [year, month, day] = value.split('-').map(Number);
    const targetYear = year - 1;
    return iso(targetYear, month, Math.min(day, endDay(targetYear, month)));
  };
  return {
    semantic_type: 'SAME_PERIOD_PREVIOUS_YEAR',
    date_from: shift(base.date_from),
    date_to: shift(base.date_to),
    time_grain: base.time_grain ?? 'MONTH',
    cutoff_mode: base.cutoff_mode ?? 'FULL_PERIOD',
    preserves_base_shape: true,
  };
}

export function resolveTemporalIntent(expression, options = {}) {
  const timezone = options.timezone ?? CIDEF_TIMEZONE;
  const today = localDate(options.now ?? new Date(), timezone);
  const text = normalize(expression);
  const todayIso = iso(today.year, today.month, today.day);

  if (!text) {
    if (options.defaultPresentPeriod) {
      return resolved(expression, 'CURRENT_MONTH_TO_DATE', {
        dateFrom: iso(today.year, today.month, 1), dateTo: todayIso,
      }, { timezone, completePeriodOnly: false, periodStatus: 'PARTIAL' });
    }
    return ambiguous(expression, timezone, 'TEMPORAL_EXPRESSION_MISSING');
  }

  if (/\b(este ultimo periodo|this last period|ultimo periodo)\b/.test(text)) {
    return ambiguous(expression, timezone);
  }

  if (/\b(ultimo trimestre|trimestre anterior|previous quarter|last quarter)\b/.test(text)) {
    const currentQuarterStartMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
    const end = shiftMonth(today.year, currentQuarterStartMonth, -1);
    const start = shiftMonth(end.year, end.month, -2);
    return resolved(expression, 'LAST_CLOSED_CALENDAR_QUARTER', {
      dateFrom: iso(start.year, start.month, 1),
      dateTo: iso(end.year, end.month, endDay(end.year, end.month)),
    }, { timezone });
  }

  const rolling = text.match(/\b(?:ultimos|last) ([a-z]+|\d+) (?:meses|months)(?: cerrados| closed)?\b/);
  if (rolling) {
    const count = parseCount(rolling[1]);
    if (!count) return ambiguous(expression, timezone, 'INVALID_ROLLING_MONTH_COUNT');
    const includesOpen = /\b(incluyendo este mes|including this month)\b/.test(text);
    if (includesOpen) {
      const start = shiftMonth(today.year, today.month, -(count - 1));
      return resolved(expression, 'ROLLING_CALENDAR_MONTHS_INCLUDING_OPEN', {
        dateFrom: iso(start.year, start.month, 1), dateTo: todayIso,
      }, { timezone, completePeriodOnly: false, periodStatus: 'PARTIAL' });
    }
    return resolved(expression, 'LAST_N_CLOSED_CALENDAR_MONTHS', lastClosedMonths(count, today), {
      timezone, periodCount: count,
    });
  }

  if (/\b(este trimestre|this quarter|current quarter)\b/.test(text)) {
    const startMonth = Math.floor((today.month - 1) / 3) * 3 + 1;
    return resolved(expression, 'CURRENT_CALENDAR_QUARTER_TO_DATE', {
      dateFrom: iso(today.year, startMonth, 1), dateTo: todayIso,
    }, { timezone, completePeriodOnly: false, periodStatus: 'PARTIAL' });
  }

  if (/\b(mes pasado|ultimo mes cerrado|previous month|last closed month)\b/.test(text)) {
    return resolved(expression, 'LAST_CLOSED_CALENDAR_MONTH', lastClosedMonths(1, today), { timezone });
  }

  if (/\b(ytd|ano a la fecha|year to date)\b/.test(text)) {
    return resolved(expression, 'YEAR_TO_DATE', {
      dateFrom: iso(today.year, 1, 1), dateTo: todayIso,
    }, { timezone, completePeriodOnly: false, periodStatus: 'PARTIAL' });
  }

  if (/\b(mismo dia|same day|al mismo dia)\b/.test(text)) {
    const base = resolved(expression, 'CURRENT_MONTH_SAME_DAY', {
      dateFrom: iso(today.year, today.month, 1), dateTo: todayIso,
    }, { timezone, cutoffMode: 'SAME_DAY', completePeriodOnly: false, periodStatus: 'PARTIAL' });
    return { ...base, comparison: previousYearPeriod(base) };
  }

  const named = namedMonthRange(text, today);
  if (named?.ambiguous) return ambiguous(expression, timezone, named.reason);
  if (named) return resolved(expression, 'EXPLICIT_CLOSED_MONTH_RANGE', named, { timezone });

  if (/\b(este mes|this month|current month)\b/.test(text) || options.defaultPresentPeriod) {
    return resolved(expression, 'CURRENT_MONTH_TO_DATE', {
      dateFrom: iso(today.year, today.month, 1), dateTo: todayIso,
    }, { timezone, completePeriodOnly: false, periodStatus: 'PARTIAL' });
  }

  if (/\b(mismo periodo ano anterior|same period last year|same period previous year)\b/.test(text)) {
    if (!options.basePeriod) return ambiguous(expression, timezone, 'BASE_PERIOD_REQUIRED');
    return { status: 'RESOLVED', expression, timezone, ...previousYearPeriod(options.basePeriod) };
  }

  return ambiguous(expression, timezone);
}
