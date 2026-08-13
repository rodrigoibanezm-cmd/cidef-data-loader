import { refreshMarketPenetrationMonthly } from '../market-penetration-monthly.js';

export async function run() {
  return { table: 'market_penetration_monthly', ...(await refreshMarketPenetrationMonthly()) };
}
