import { semanticError } from './common.js';

const COMPATIBLE_VENTAS_CRM_UNIVERSES = new Set(['COMPANY', 'OWN_STORES']);

export function assertVentasCrmCommercialDomainCompatibility(ventasCommercialUniverse, crmCommercialUniverse) {
  if (ventasCommercialUniverse === crmCommercialUniverse
    && COMPATIBLE_VENTAS_CRM_UNIVERSES.has(ventasCommercialUniverse)) {
    return true;
  }

  throw semanticError(
    'DOMAIN_MISMATCH',
    `VENTAS commercial_universe=${ventasCommercialUniverse} is incompatible with CRM commercial_universe=${crmCommercialUniverse}`,
  );
}
