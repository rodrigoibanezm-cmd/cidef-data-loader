import { buildVentasOrganizationalContext } from '../ventas-org/buildVentasOrganizationalContext.js';

export const ENGINE_NAME = 'ventas_organizational_context_v01';
export const ENGINE_VERSION = '0.1';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateInput(input) {
  const startMonth = String(input?.start_month || '');
  const endMonth = String(input?.end_month || '');
  if (!MONTH_RE.test(startMonth)) throw new Error('Invalid start_month; expected YYYY-MM');
  if (!MONTH_RE.test(endMonth)) throw new Error('Invalid end_month; expected YYYY-MM');
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  return { startMonth, endMonth };
}

export async function ventasOrganizationalContextV01(input = {}) {
  const scope = validateInput(input);
  const context = await buildVentasOrganizationalContext(scope);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.validation.ok ? 'ok' : 'warning',
    policy: {
      recognition: 'reuse ventas_context_v01 recognizedSales without reimplementing commercial recognition',
      identity: 'exact source keys from recognized event -> sucursales_master/personas_master',
      seller_membership: 'resolved persona + date-effective VENDEDOR_TIENDA role and assignment matching the observed CIDEF store',
      historical_store: 'observed store must match date-effective persona_sucursal; current assignment never rewrites history',
      window: 'start_month/end_month filter output after recognition; end_month is not a cutoff',
      persistence: 'runtime only',
    },
    ...context,
  };
}
