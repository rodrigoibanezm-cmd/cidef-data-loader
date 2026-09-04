import { buildCrmLongitudinal, ENGINE_NAME } from '../longitudinal/crm.js';
export { ENGINE_NAME };
export const ENGINE_VERSION = '0.1';
export async function crmLongitudinalContextV01(input = {}) { return buildCrmLongitudinal(input); }
export const run = crmLongitudinalContextV01;
