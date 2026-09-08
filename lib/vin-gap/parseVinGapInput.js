import { shiftMonth } from '../expectation/monthSeries.js';

const ALLOWED_FIELDS = new Set(['commercial_universe', 'store_id', 'brand_id', 'month', 'grain']);

export function currentMonthSantiago(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function positiveId(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} must be a positive integer`);
  return parsed;
}

export function parseVinGapInput(input = {}, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('vin_gap_v01 input must be an object');
  }
  const unsupportedFields = Object.keys(input).filter((field) => !ALLOWED_FIELDS.has(field));
  if (unsupportedFields.length) throw new Error(`Unsupported vin_gap_v01 input(s): ${unsupportedFields.join(', ')}`);

  const commercialUniverse = String(input.commercial_universe ?? '').trim().toUpperCase();
  const grain = String(input.grain ?? 'STORE_BRAND_MONTH').trim().toUpperCase();
  const month = String(input.month ?? '');
  if (!shiftMonth(month, 0)) throw new Error('month must use YYYY-MM format');

  return {
    commercialUniverse,
    storeId: positiveId(input.store_id, 'store_id'),
    brandId: positiveId(input.brand_id, 'brand_id'),
    month,
    grain,
    referenceCutoffMonth: shiftMonth(month, -1),
    currentMonth: currentMonthSantiago(now),
    periodClosed: month < currentMonthSantiago(now),
  };
}
