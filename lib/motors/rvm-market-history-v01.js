import { buildMarketHistory } from '../rvm/buildMarketHistory.js';

export const ENGINE_NAME = 'rvm_market_history_v01';
export const ENGINE_VERSION = '0.1';

export async function rvmMarketHistoryV01(input = {}) {
  const result = await buildMarketHistory(input);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: result.validation.reconciliation_status === 'OK' ? (result.warnings.length ? 'warning' : 'ok') : 'warning',
    ...result,
  };
}

export const run = rvmMarketHistoryV01;
