const ALLOWED = new Set([
  'min_days',
  'as_of',
  'dealer_id',
  'dealer_group_id',
  'detail_limit',
]);

function parseId(value, name) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseAsOf(value) {
  if (value == null) return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('as_of must be YYYY-MM-DD');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error('as_of must be a valid calendar date');
  }
  return text;
}

export function parseDealerAgingInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('input must be an object');
  const unknown = Object.keys(input).filter((key) => !ALLOWED.has(key));
  if (unknown.length) throw new Error(`Unsupported dealer aging input: ${unknown.join(', ')}`);

  const minDays = input.min_days == null ? 60 : Number(input.min_days);
  if (!Number.isInteger(minDays) || minDays < 0) throw new Error('min_days must be a non-negative integer');

  const detailLimit = input.detail_limit == null ? 100 : Number(input.detail_limit);
  if (!Number.isInteger(detailLimit) || detailLimit < 1 || detailLimit > 500) {
    throw new Error('detail_limit must be an integer between 1 and 500');
  }

  return {
    minDays,
    asOf: parseAsOf(input.as_of),
    dealerId: parseId(input.dealer_id, 'dealer_id'),
    dealerGroupId: parseId(input.dealer_group_id, 'dealer_group_id'),
    detailLimit,
  };
}
