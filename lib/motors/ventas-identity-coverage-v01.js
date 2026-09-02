import { buildIdentityCoverage } from '../ventas-identity/buildIdentityCoverage.js';

export const ENGINE_NAME = 'ventas_identity_coverage_v01';
export const ENGINE_VERSION = '0.1';

export async function ventasIdentityCoverageV01(input = {}) {
  if (Object.keys(input || {}).length) throw new Error('ventas_identity_coverage_v01 input must be empty');
  const result = await buildIdentityCoverage();
  const complete = result.validation.ok && result.warnings.length === 0;

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: complete ? 'ok' : 'warning',
    policy: {
      grain: 'ventas_raw source row',
      store_identity: 'exact id_sucursal_vta -> sucursales_master.id_sucursal_vta',
      seller_identity: 'exact nombre_usuario -> personas_master.usuario_canonico',
      seller_membership: 'identity is separate from VENDEDOR_TIENDA role and CIDEF assignment active on fecha_factura',
      sales_membership_authority: 'ventas_raw never creates seller role, validity, assignment, or membership',
      persistence: 'runtime only',
    },
    ...result,
  };
}
