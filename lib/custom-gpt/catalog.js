export const RAW_TABLES = Object.freeze([
  'vehiculos_raw',
  'ventas_raw',
  'notas_venta_raw',
  'rvm_raw',
]);

export const MASTER_TABLES = Object.freeze([
  'marcas_master_v01',
  'modelos_master_v01',
  'versiones_master_v01',
  'producto_aliases_v01',
  'producto_clasificacion_v01',
  'producto_portafolio_v01',
  'sucursales_master',
  'sucursal_aliases',
  'dealer_groups',
  'dealers_master',
  'dealer_aliases',
  'dealer_supervisor',
  'personas_master',
  'persona_aliases',
  'persona_roles',
  'persona_sucursal',
  'persona_estado_comercial',
  'master_conflicts',
]);

export const CUSTOM_GPT_TABLES = Object.freeze([...RAW_TABLES, ...MASTER_TABLES]);
const ALLOWED = new Set(CUSTOM_GPT_TABLES);

export function assertTable(table) {
  if (!ALLOWED.has(table)) throw new Error('Table not allowed');
  return table;
}
