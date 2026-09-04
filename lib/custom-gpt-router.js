import { CUSTOM_GPT_TABLES } from './custom-gpt/catalog.js';
import {
  DOMAIN_CAPABILITY_REGISTRY,
  listCapabilityDomains,
  listDomainCapabilities,
  resolveDomainCapability,
} from './custom-gpt/capabilityRegistry.js';
import { profileTable } from './custom-gpt/profileTable.js';
import { queryTable } from './custom-gpt/queryTable.js';
import { listTables, tableSchema } from './custom-gpt/tableMetadata.js';
import { assertVentasCrmCommercialDomainCompatibility } from './longitudinal/commercial-domain-compatibility.js';
import { competitiveContextV01 } from './motors/competitive-context-v01.js';
import { competitiveInverseShareMovementV01 } from './motors/competitive-inverse-share-movement-v01.js';
import { competitiveRelationV01 } from './motors/competitive-relation-v01.js';
import { competitiveShareTrajectoryV01 } from './motors/competitive-share-trajectory-v01.js';
import { competitiveSignalBacktestV01 } from './motors/competitive-signal-backtest-v01.js';
import { currentMonthCloseForecastV01 } from './motors/current-month-close-forecast-v01.js';
import { dailyCloseBacktestContextV01 } from './motors/daily-close-backtest-context-v01.js';
import { dailyCloseForecastBacktestV01 } from './motors/daily-close-forecast-backtest-v01.js';
import { dailyCloseForecastV01 } from './motors/daily-close-forecast-v01.js';
import { dealerInventoryAgingV01 } from './motors/dealer-inventory-aging-v01.js';
import { expectedMonthlyBacktestV01 } from './motors/expected-monthly-backtest-v01.js';
import { expectedMonthlyCandidatesV01 } from './motors/expected-monthly-candidates-v01.js';
import { expectedMonthlyStabilityV01 } from './motors/expected-monthly-stability-v01.js';
import { intramonthSalesHistoryContextV01 } from './motors/intramonth-sales-history-context-v01.js';
import { organizationalRelativePerformanceV01 } from './motors/organizational-relative-performance-v01.js';
import { organizationalShareExpectationBacktestV01 } from './motors/organizational-share-expectation-backtest-v01.js';
import { orgSalesDeteriorationBacktestV01 } from './motors/org-sales-deterioration-backtest-v01.js';
import { orgSalesDeteriorationEpisodeEvidenceV01 } from './motors/org-sales-deterioration-episode-evidence-v01.js';
import { orgSalesDeteriorationStatusV01 } from './motors/org-sales-deterioration-status-v01.js';
import { orgSalesObservationSemanticsAuditV01 } from './motors/org-sales-observation-semantics-audit-v01.js';
import { predictabilityDayV01 } from './motors/predictability-day-v01.js';
import { productGenerationContextV01 } from './motors/product-generation-context-v01.js';
import { rvmMarketHistoryV01 } from './motors/rvm-market-history-v01.js';
import { ventasCommercialContextV01 } from './motors/ventas-commercial-context-v01.js';
import { ventasLongitudinalContextV01 } from './motors/ventas-longitudinal-context-v01.js';
import { rvmLongitudinalContextV01 } from './motors/rvm-longitudinal-context-v01.js';
import { crmLongitudinalContextV01 } from './motors/crm-longitudinal-context-v01.js';
import { vinGrowthDiagnosticV01 } from './motors/vin-growth-diagnostic-v01.js';
import { ventasCrossMonthFirstLastAuditV01 } from './motors/ventas-cross-month-first-last-audit-v01.js';
import { ventasDailyContextV01 } from './motors/ventas-daily-context-v01.js';
import { ventasDailyOrganizationalContextV01 } from './motors/ventas-daily-organizational-context-v01.js';
import { ventasHybridUnresolvedSensitivityV01 } from './motors/ventas-hybrid-unresolved-sensitivity-v01.js';
import { ventasIdentityCoverageV01 } from './motors/ventas-identity-coverage-v01.js';
import { ventasMonthlyActualV01 } from './motors/ventas-monthly-actual-v01.js';
import { ventasMonthlyDedupSensitivityV01 } from './motors/ventas-monthly-dedup-sensitivity-v01.js';
import { ventasOrganizationalContextV01 } from './motors/ventas-organizational-context-v01.js';
import { ventasProductChangeContributionV01 } from './motors/ventas-product-change-contribution-v01.js';
import { ventasProductConcentrationV01 } from './motors/ventas-product-concentration-v01.js';
import { ventasProductDetailV01 } from './motors/ventas-product-detail-v01.js';
import { ventasProductModelResolutionV01 } from './motors/ventas-product-model-resolution-v01.js';
import { ventasProductSalesV01 } from './motors/ventas-product-sales-v01.js';
import { ventasSellerChangeContributionV01 } from './motors/ventas-seller-change-contribution-v01.js';
import { ventasStoreChangeContributionV01 } from './motors/ventas-store-change-contribution-v01.js';
import { ventasUnresolvedRecognitionEvidenceV01 } from './motors/ventas-unresolved-recognition-evidence-v01.js';

export { CUSTOM_GPT_TABLES };
export { DOMAIN_CAPABILITY_REGISTRY, listCapabilityDomains, listDomainCapabilities, resolveDomainCapability };

const ACTIONS = Object.freeze({
  list_tables: listTables,
  table_schema: tableSchema,
  query_table: queryTable,
  profile_table: profileTable,
  ventas_monthly_dedup_sensitivity_v01: ventasMonthlyDedupSensitivityV01,
  ventas_cross_month_first_last_audit_v01: ventasCrossMonthFirstLastAuditV01,
  ventas_hybrid_unresolved_sensitivity_v01: ventasHybridUnresolvedSensitivityV01,
  ventas_unresolved_recognition_evidence_v01: ventasUnresolvedRecognitionEvidenceV01,
  ventas_identity_coverage_v01: ventasIdentityCoverageV01,
  ventas_commercial_context_v01: ventasCommercialContextV01,
  ventas_monthly_actual_v01: ventasMonthlyActualV01,
  ventas_daily_context_v01: ventasDailyContextV01,
  ventas_daily_organizational_context_v01: ventasDailyOrganizationalContextV01,
  daily_close_backtest_context_v01: dailyCloseBacktestContextV01,
  daily_close_forecast_backtest_v01: dailyCloseForecastBacktestV01,
  daily_close_forecast_v01: dailyCloseForecastV01,
  current_month_close_forecast_v01: currentMonthCloseForecastV01,
  predictability_day_v01: predictabilityDayV01,
  intramonth_sales_history_context_v01: intramonthSalesHistoryContextV01,
  ventas_product_sales_v01: ventasProductSalesV01,
  ventas_product_detail_v01: ventasProductDetailV01,
  ventas_product_model_resolution_v01: ventasProductModelResolutionV01,
  ventas_product_concentration_v01: ventasProductConcentrationV01,
  ventas_product_change_contribution_v01: ventasProductChangeContributionV01,
  ventas_store_change_contribution_v01: ventasStoreChangeContributionV01,
  ventas_seller_change_contribution_v01: ventasSellerChangeContributionV01,
  ventas_organizational_context_v01: ventasOrganizationalContextV01,
  expected_monthly_backtest_v01: expectedMonthlyBacktestV01,
  expected_monthly_stability_v01: expectedMonthlyStabilityV01,
  expected_monthly_candidates_v01: expectedMonthlyCandidatesV01,
  competitive_context_v01: competitiveContextV01,
  competitive_share_trajectory_v01: competitiveShareTrajectoryV01,
  competitive_signal_backtest_v01: competitiveSignalBacktestV01,
  competitive_relation_v01: competitiveRelationV01,
  competitive_inverse_share_movement_v01: competitiveInverseShareMovementV01,
  rvm_market_history_v01: rvmMarketHistoryV01,
  ventas_longitudinal_context_v01: ventasLongitudinalContextV01,
  rvm_longitudinal_context_v01: rvmLongitudinalContextV01,
  crm_longitudinal_context_v01: crmLongitudinalContextV01,
  vin_growth_diagnostic_v01: vinGrowthDiagnosticV01,
  product_generation_context_v01: productGenerationContextV01,
  organizational_share_expectation_backtest_v01: organizationalShareExpectationBacktestV01,
  organizational_relative_performance_v01: organizationalRelativePerformanceV01,
  org_sales_deterioration_backtest_v01: orgSalesDeteriorationBacktestV01,
  org_sales_deterioration_episode_evidence_v01: orgSalesDeteriorationEpisodeEvidenceV01,
  org_sales_deterioration_status_v01: orgSalesDeteriorationStatusV01,
  org_sales_observation_semantics_audit_v01: orgSalesObservationSemanticsAuditV01,
  dealer_inventory_aging_v01: dealerInventoryAgingV01,
});

export const LONGITUDINAL_ACTION_BY_DOMAIN = Object.freeze({ VENTAS: 'ventas_longitudinal_context_v01', RVM: 'rvm_longitudinal_context_v01', CRM: 'crm_longitudinal_context_v01' });
function routingError(code, detail = null) { const error = new Error(detail ? `${code}: ${detail}` : code); error.code = code; return error; }
function validateLongitudinalRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw routingError('INVALID_LONGITUDINAL_CONTEXT');
  const domain = String(value.domain || '').trim().toUpperCase();
  if (!LONGITUDINAL_ACTION_BY_DOMAIN[domain]) throw routingError('INVALID_LONGITUDINAL_DOMAIN', String(value.domain ?? 'missing'));
  const allowedFields = new Set(['domain','metric','grain','filters','date_from','date_to','time_grain','breakdown','entity','universe_filters','date_axis','mode','cohort_axis','cutoff_date','cutoff_mode','commercial_universe']);
  const unsupported = Object.keys(value).find((field) => !allowedFields.has(field));
  if (unsupported) throw routingError('UNSUPPORTED_LONGITUDINAL_CONTEXT_FIELD', unsupported);
  for (const field of ['metric','grain','filters','date_from','date_to','time_grain']) if (value[field] == null) throw routingError('MISSING_LONGITUDINAL_CONTEXT_FIELD', field);
  if (!value.filters || typeof value.filters !== 'object' || Array.isArray(value.filters)) throw routingError('INVALID_LONGITUDINAL_CONTEXT_FIELD', 'filters');
  if (domain === 'CRM') {
    if (value.mode == null) throw routingError('MISSING_LONGITUDINAL_CONTEXT_FIELD', 'mode');
    const mode = String(value.mode).trim().toUpperCase();
    if (mode === 'EVENT' && value.date_axis == null) throw routingError('MISSING_LONGITUDINAL_CONTEXT_FIELD', 'date_axis');
    if (mode === 'COHORT' && value.cohort_axis == null) throw routingError('MISSING_LONGITUDINAL_CONTEXT_FIELD', 'cohort_axis');
  }
  const { domain: ignored, ...input } = value;
  return { domain, action: LONGITUDINAL_ACTION_BY_DOMAIN[domain], input };
}
function validateCrossDomainCommercialCompatibility(analyticalResult, longitudinalContext) {
  const outputs = [analyticalResult, longitudinalContext]; const ventas = outputs.find((output) => output?.domain === 'VENTAS'); const crm = outputs.find((output) => output?.domain === 'CRM'); if (!ventas || !crm) return;
  const ventasCommercialUniverse = ventas.commercial_scope?.universe; const crmCommercialUniverse = crm.commercial_scope?.universe;
  if (ventasCommercialUniverse == null) throw routingError('MISSING_COMMERCIAL_SCOPE', 'VENTAS');
  if (crmCommercialUniverse == null) throw routingError('MISSING_COMMERCIAL_SCOPE', 'CRM');
  assertVentasCrmCommercialDomainCompatibility(ventasCommercialUniverse, crmCommercialUniverse);
}
export function listCustomGptActions() { return Object.keys(ACTIONS); }
export async function runCustomGptAction(action, input = {}) { const run = ACTIONS[action]; if (!run) throw new Error('Unknown Custom GPT action'); return run(input); }
export async function runCustomGptCapability(request = {}, executor = runCustomGptAction) {
  const resolved = resolveDomainCapability(request.domain, request.capability); const input = request.input ?? {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw routingError('INVALID_CAPABILITY_INPUT');
  return executor(resolved.action, input);
}
export async function runCustomGptActionWithContext(request = {}, executor = runCustomGptAction) {
  const flag = request.requires_longitudinal_context;
  if (flag != null && typeof flag !== 'boolean') throw routingError('INVALID_REQUIRES_LONGITUDINAL_CONTEXT');
  if (flag !== true) return executor(request.action, request.input ?? {});
  const longitudinal = validateLongitudinalRequest(request.longitudinal_context);
  const [analyticalResult, longitudinalContext] = await Promise.all([executor(request.action, request.input ?? {}), executor(longitudinal.action, longitudinal.input)]);
  validateCrossDomainCommercialCompatibility(analyticalResult, longitudinalContext);
  return { analytical_result: analyticalResult, longitudinal_context: longitudinalContext };
}
