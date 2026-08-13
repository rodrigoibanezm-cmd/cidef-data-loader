const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function requiredEnum(input, key, values) {
  if (input[key] == null || String(input[key]).trim() === '') throw new Error(`${key} is required`);
  const value = String(input[key]).trim().toUpperCase();
  if (!values.includes(value)) throw new Error(`${key} must be ${values.join(' or ')}`);
  return value;
}

function positiveInteger(value, fallback, key, maximum = Infinity) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${key} must be a positive integer${Number.isFinite(maximum) ? ` up to ${maximum}` : ''}`);
  }
  return number;
}

function optionalUpper(value) {
  return value == null || String(value).trim() === '' ? null : String(value).trim().toUpperCase();
}

export function geographicMarketInput(input = {}) {
  const level = requiredEnum(input, 'level', ['REGION', 'COMUNA']);
  const universe = requiredEnum(input, 'universe', ['ALL', 'CHINA']);
  const comparison = String(input.comparison || 'none').trim().toLowerCase();
  if (!['none', 'rolling', 'same_period_last_year'].includes(comparison)) {
    throw new Error('comparison must be none, rolling or same_period_last_year');
  }
  const endMonth = optionalUpper(input.end_month);
  if (endMonth && !MONTH.test(endMonth)) throw new Error('end_month must be YYYY-MM');
  const segment = optionalUpper(input.segment) || 'TOTAL';
  return {
    level, universe, brand: optionalUpper(input.brand),
    segment: segment === 'CAMIONETA' ? 'PICK-UP' : segment,
    months: positiveInteger(input.months, 12, 'months'), comparison,
    end_month: endMonth, page: positiveInteger(input.page, 1, 'page'),
    page_size: positiveInteger(input.page_size, 50, 'page_size', 100),
  };
}

export function shiftMonth(yearMonth, offset) {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function geographicPeriods(endMonth, months, comparison) {
  const current = { desde: shiftMonth(endMonth, 1 - months), hasta: endMonth };
  if (comparison === 'none') return { current, previous: null };
  const offset = comparison === 'rolling' ? -months : -12;
  return {
    current,
    previous: { desde: shiftMonth(current.desde, offset), hasta: shiftMonth(endMonth, offset) },
  };
}
