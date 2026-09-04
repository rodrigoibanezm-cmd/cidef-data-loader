import { buildRvmLongitudinal, ENGINE_NAME } from '../longitudinal/rvm.js';
export { ENGINE_NAME };
export const ENGINE_VERSION = '0.1';
export async function rvmLongitudinalContextV01(input = {}) { return buildRvmLongitudinal(input); }
export const run = rvmLongitudinalContextV01;
