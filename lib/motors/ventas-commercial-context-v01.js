import { buildVentasCommercialContext } from '../ventas-commercial/buildVentasCommercialContext.js';

export async function ventasCommercialContextV01(input = {}) {
  return buildVentasCommercialContext(input);
}

export async function run(input = {}) {
  return ventasCommercialContextV01(input);
}
