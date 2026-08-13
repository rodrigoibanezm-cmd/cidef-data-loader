const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const KEYS = new Set([
  'scope', 'group_by', 'brand', 'model', 'branch', 'seller',
  'date_from', 'date_to', 'page', 'page_size',
]);
const GROUPS = {
  MARKET: ['TOTAL', 'MARCA', 'MODELO'],
  CIDEF: ['TOTAL', 'MARCA', 'MODELO', 'SUCURSAL', 'VENDEDOR'],
};

function requiredScope(value) {
  if (value == null || String(value).trim() === '') throw new Error('scope is required');
  const scope = String(value).trim().toUpperCase();
  if (!GROUPS[scope]) throw new Error('scope must be MARKET or CIDEF');
  return scope;
}

function optionalUpper(value) {
  return value == null || String(value).trim() === '' ? null : String(value).trim().toUpperCase();
}

function positiveInteger(value, fallback, key, maximum = Infinity) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${key} must be a positive integer${Number.isFinite(maximum) ? ` up to ${maximum}` : ''}`);
  }
  return number;
}

export function shiftMonth(yearMonth, offset) {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function seasonalityInput(input = {}) {
  for (const key of Object.keys(input)) if (!KEYS.has(key)) throw new Error(`Unknown input: ${key}`);
  const scope = requiredScope(input.scope);
  const groupBy = optionalUpper(input.group_by) || 'TOTAL';
  if (!GROUPS[scope].includes(groupBy)) throw new Error(`group_by is not valid for scope ${scope}`);
  const dateFrom = optionalUpper(input.date_from);
  const dateTo = optionalUpper(input.date_to);
  if (dateFrom && !MONTH.test(dateFrom)) throw new Error('date_from must be YYYY-MM');
  if (dateTo && !MONTH.test(dateTo)) throw new Error('date_to must be YYYY-MM');
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error('date_from must not exceed date_to');
  const branch = optionalUpper(input.branch);
  const seller = optionalUpper(input.seller);
  if (scope === 'MARKET' && (branch || seller)) throw new Error('branch and seller require scope CIDEF');
  return {
    scope, group_by: groupBy, brand: optionalUpper(input.brand),
    model: optionalUpper(input.model), branch, seller,
    date_from: dateFrom, date_to: dateTo,
    page: groupBy === 'TOTAL' ? 1 : positiveInteger(input.page, 1, 'page'),
    page_size: groupBy === 'TOTAL' ? 1 : positiveInteger(input.page_size, 50, 'page_size', 100),
  };
}

export function seasonalityParams(input) {
  return [input.date_from && `${input.date_from}-01`,
    input.date_to && `${shiftMonth(input.date_to, 1)}-01`, input.brand, input.model,
    input.branch, input.seller, input.page_size, (input.page - 1) * input.page_size];
}
