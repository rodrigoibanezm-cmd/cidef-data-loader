import { buildVentasMonthlyAnalyticalContext } from '../ventas-universe/buildVentasMonthlyAnalyticalContext.js';
import { calculateVinGap } from '../vin-gap/calculateVinGap.js';
import { parseVinGapInput } from '../vin-gap/parseVinGapInput.js';

export const ENGINE_NAME = 'vin_gap_v01';
export const ENGINE_VERSION = '0.1';

export async function vinGapV01(input = {}, dependencies = {}) {
  const parsed = parseVinGapInput(input, dependencies.now ?? new Date());
  if (parsed.commercialUniverse !== 'OWN_STORES' || parsed.grain !== 'STORE_BRAND_MONTH') {
    return calculateVinGap({ observedContext: null, referenceContext: null }, parsed);
  }
  const buildContext = dependencies.buildContext ?? buildVentasMonthlyAnalyticalContext;
  const scope = {
    commercial_universe: parsed.commercialUniverse,
    store_id: parsed.storeId,
    brand_id: parsed.brandId,
  };
  const [observedContext, referenceContext] = await Promise.all([
    buildContext({ ...scope, cutoff_month: parsed.month }),
    buildContext({ ...scope, cutoff_month: parsed.referenceCutoffMonth }),
  ]);
  return calculateVinGap({ observedContext, referenceContext }, parsed);
}
