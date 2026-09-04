import { buildVentasLongitudinal, ENGINE_NAME } from '../longitudinal/ventas.js';

export { ENGINE_NAME };
export const ENGINE_VERSION = '0.1';
export async function ventasLongitudinalContextV01(input = {}) { return buildVentasLongitudinal(input); }
export const run = ventasLongitudinalContextV01;
