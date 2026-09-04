import { buildVentasCommercialContext } from '../ventas-commercial/buildVentasCommercialContext.js';

export async function ventasCommercialContextV01(input = {}) {
  if (input.commercial_universe == null && input.universe == null) {
    const error = new Error('MISSING_COMMERCIAL_UNIVERSE: ventas_commercial_context_v01 requires an explicit commercial_universe');
    error.code = 'MISSING_COMMERCIAL_UNIVERSE';
    throw error;
  }
  return buildVentasCommercialContext(input);
}

export async function run(input = {}) {
  return ventasCommercialContextV01(input);
}
