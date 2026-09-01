const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GEO_COLUMNS = Object.freeze({ region: 'region', comuna: 'comuna_adquisicion' });

function validDate(value) {
  if (!DATE_RE.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function modelIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('target_model_ids is required');
  }
  const ids = [...new Set(value.map(Number))];
  if (ids.length > 50 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('target_model_ids must contain 1-50 positive integers');
  }
  return ids;
}

function geography(value) {
  if (value == null) return null;
  if (!value || !GEO_COLUMNS[value.level]) throw new Error('Invalid geography.level');
  if (!Array.isArray(value.values) || !value.values.length || value.values.length > 100) {
    throw new Error('geography.values must contain 1-100 values');
  }
  const values = [...new Set(value.values.map((item) => String(item).trim()).filter(Boolean))];
  if (!values.length) throw new Error('geography.values cannot be empty');
  return { level: value.level, column: GEO_COLUMNS[value.level], values };
}

export function parseCompetitiveInput(input = {}) {
  const dateFrom = input.date_from;
  const dateTo = input.date_to;
  if (!validDate(dateFrom) || !validDate(dateTo)) {
    throw new Error('date_from and date_to must use YYYY-MM-DD');
  }
  if (dateFrom > dateTo) throw new Error('date_from must be <= date_to');
  return {
    targetModelIds: modelIds(input.target_model_ids),
    dateFrom,
    dateTo,
    geography: geography(input.geography),
  };
}
