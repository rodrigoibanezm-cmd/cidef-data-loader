import { buildCrmContext, ENGINE_NAME, ENGINE_VERSION } from '../crm-context/buildCrmContext.js';

export { ENGINE_NAME, ENGINE_VERSION };

export async function crmContextV01(input = {}) {
  return buildCrmContext(input);
}

export const run = crmContextV01;
