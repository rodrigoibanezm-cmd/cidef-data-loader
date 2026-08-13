import { refreshMarketPenetrationMonthly } from '../market-penetration-monthly.js';

export async function run() {
  return {
    tables: ['market_penetration_monthly_all', 'market_penetration_monthly_china'],
    ...(await refreshMarketPenetrationMonthly()),
  };
}
