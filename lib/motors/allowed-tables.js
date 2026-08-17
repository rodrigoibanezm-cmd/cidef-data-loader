export const ANALYTIC_TABLES = new Set([
  'rvm_raw',
  'inventario_vehiculos_global_raw',
  'notas_venta_raw',
  'estadisticas_venta_raw',
  'lista_precios_raw',
  'brands_master',
  'vehicle_models_master',
  'vehicle_versions_master',
  'active_vehicle_models',
  'active_vehicle_models_history',
  'market_penetration_monthly_all',
  'market_penetration_monthly_china',
  'dealers_master',
  'dealer_sucursales',
  'supervisor_dealer_analytics',
]);

export function assertAnalyticTable(table) {
  if (!ANALYTIC_TABLES.has(table)) throw new Error('Table not allowed');
  return table;
}

export function listAnalyticTables() {
  return [...ANALYTIC_TABLES].sort();
}
