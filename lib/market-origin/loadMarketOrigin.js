import { readFileSync } from 'node:fs';

const DATA = JSON.parse(readFileSync(
  new URL('../../data/market-origin/CL.json', import.meta.url),
  'utf8',
));

export function normalizeMarketBrand(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const aliases = Object.fromEntries(
  Object.entries(DATA.aliases || {}).map(([key, value]) => [
    normalizeMarketBrand(key),
    normalizeMarketBrand(value),
  ]),
);

const brands = Object.fromEntries(
  Object.entries(DATA.brands || {}).map(([key, value]) => [
    normalizeMarketBrand(key),
    String(value).toUpperCase(),
  ]),
);

function originGroup(countryCode) {
  if (countryCode === 'CN') return 'CHINESE';
  if (countryCode) return 'NON_CHINESE';
  return 'UNKNOWN';
}

export function getMarketBrandOrigin(brand, market = 'CL') {
  const requestedMarket = String(market || '').toUpperCase();
  const inputKey = normalizeMarketBrand(brand);
  const brandKey = aliases[inputKey] || inputKey;
  const countryCode = requestedMarket === DATA.market ? brands[brandKey] || null : null;
  return {
    market: requestedMarket,
    brandKey,
    countryCode,
    originGroup: originGroup(countryCode),
    status: countryCode ? 'AVAILABLE' : 'MISSING',
  };
}

export function marketOriginMetadata() {
  return {
    market: DATA.market,
    classification: DATA.classification,
    coverage: DATA.coverage,
    source: { ...DATA.source },
    mappedBrands: Object.keys(brands).length,
  };
}
