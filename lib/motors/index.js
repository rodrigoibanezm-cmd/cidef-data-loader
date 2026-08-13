import * as inventario from './import-inventario.js';
import * as notasVenta from './import-notas-venta.js';
import * as estadisticasVenta from './import-estadisticas-venta.js';
import * as listaPrecios from './import-lista-precios.js';
import * as rvm from './import-rvm.js';
import * as normalizeRvm from './normalize-rvm.js';
import * as profileTable from './profile-table.js';
import * as queryTable from './query-table.js';
import * as tableSchema from './table-schema.js';
import * as joinTables from './join-tables.js';
import * as salesConsolidation from './sales-consolidation.js';
import * as timeAnalysis from './time-analysis.js';
import * as distributionAnalysis from './distribution-analysis.js';
import * as groupAnalysis from './group-analysis.js';
import * as trendAnalysis from './trend-analysis.js';
import * as correlationAnalysis from './correlation-analysis.js';
import * as outlierAnalysis from './outlier-analysis.js';
import * as cohortAnalysis from './cohort-analysis.js';
import * as marginAnalysis from './margin-analysis.js';
import * as inventoryAging from './inventory-aging.js';
import * as availableInventory from './available-inventory.js';
import * as openSalesInventory from './open-sales-inventory.js';
import * as marketPenetration from './market-penetration.js';
import * as refreshMarketPenetration from './refresh-market-penetration-monthly.js';
import * as refreshActiveVehicleModels from './refresh-active-vehicle-models.js';
import * as detectPendingModelEnrichment from './detect-pending-model-enrichment.js';
import * as upsertModelEnrichment from './upsert-model-enrichment.js';
import * as refreshVehicleModelsMaster from './refresh-vehicle-models-master.js';
import * as refreshVehicleVersionsMaster from './refresh-vehicle-versions-master.js';
import * as classifyElectrification from './classify-electrification.js';
import * as rvmMarketPareto from './rvm-market-pareto.js';
import * as rvmQualityAudit from './rvm-quality-audit.js';
import * as geographicMarketAnalysis from './geographic-market-analysis.js';
import * as monthlySeasonalityAnalysis from './monthly-seasonality-analysis.js';
import * as intramonthWeekCurve from './intramonth-week-curve.js';

const MOTORS = {
  import_inventario: inventario.run,
  import_notas_venta: notasVenta.run,
  import_estadisticas_venta: estadisticasVenta.run,
  import_lista_precios: listaPrecios.run,
  import_rvm: rvm.run,
  normalize_rvm: normalizeRvm.run,
  profile_table: profileTable.run,
  query_table: queryTable.run,
  table_schema: tableSchema.run,
  join_tables: joinTables.run,
  sales_consolidation: salesConsolidation.run,
  time_analysis: timeAnalysis.run,
  distribution_analysis: distributionAnalysis.run,
  group_analysis: groupAnalysis.run,
  trend_analysis: trendAnalysis.run,
  correlation_analysis: correlationAnalysis.run,
  outlier_analysis: outlierAnalysis.run,
  cohort_analysis: cohortAnalysis.run,
  margin_analysis: marginAnalysis.run,
  inventory_aging: inventoryAging.run,
  available_inventory: availableInventory.run,
  open_sales_inventory: openSalesInventory.run,
  market_penetration: marketPenetration.run,
  refresh_market_penetration_monthly: refreshMarketPenetration.run,
  refresh_active_vehicle_models: refreshActiveVehicleModels.run,
  detect_pending_model_enrichment: detectPendingModelEnrichment.run,
  upsert_model_enrichment: upsertModelEnrichment.run,
  refresh_vehicle_models_master: refreshVehicleModelsMaster.run,
  refresh_vehicle_versions_master: refreshVehicleVersionsMaster.run,
  classify_electrification: classifyElectrification.run,
  rvm_market_pareto: rvmMarketPareto.run,
  rvm_quality_audit: rvmQualityAudit.run,
  geographic_market_analysis: geographicMarketAnalysis.run,
  monthly_seasonality_analysis: monthlySeasonalityAnalysis.run,
  intramonth_week_curve: intramonthWeekCurve.run,
};

export function getMotor(name) {
  return MOTORS[name] || null;
}

export function listMotors() {
  return Object.keys(MOTORS);
}
