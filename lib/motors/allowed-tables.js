export const ANALYTIC_TABLES = new Set([
  'inventario_vehiculos_global_raw',
  'rvm_raw',
  'dealers_master',
  'supervisor_dealer_analytics',
  'brands_master',
  'vehicle_models_master',
  'vehicle_versions_master',
  'active_vehicle_models',
  'active_vehicle_models_history',
  'market_penetration_monthly_all',
  'market_penetration_monthly_china',
  'locales_master',
  'persona_local',
  'personas_master',
  'forum_dealers_master',
]);

export function assertAnalyticTable(table) {
  if (!ANALYTIC_TABLES.has(table)) throw new Error('Table not allowed');
  return table;
}

export function listAnalyticTables() {
  return [...ANALYTIC_TABLES].sort();
}
