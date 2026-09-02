import { CUSTOM_GPT_TABLES } from './custom-gpt/catalog.js';
import { profileTable } from './custom-gpt/profileTable.js';
import { queryTable } from './custom-gpt/queryTable.js';
import { listTables, tableSchema } from './custom-gpt/tableMetadata.js';
import { competitiveContextV01 } from './motors/competitive-context-v01.js';
import { competitiveRelationV01 } from './motors/competitive-relation-v01.js';
import { competitiveShareTrajectoryV01 } from './motors/competitive-share-trajectory-v01.js';
import { competitiveSignalBacktestV01 } from './motors/competitive-signal-backtest-v01.js';
import { dailyCloseBacktestContextV01 } from './motors/daily-close-backtest-context-v01.js';
import { dailyCloseForecastBacktestV01 } from './motors/daily-close-forecast-backtest-v01.js';
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
import { productGenerationContextV01 } from './motors/product-generation-context-v01.js';
import { ventasCrossMonthFirstLastAuditV01 } from './motors/ventas-cross-month-first-last-audit-v01.js';
import { ventasDailyContextV01 } from './motors/ventas-daily-context-v01.js';
import { ventasDailyOrganizationalContextV01 } from './motors/ventas-daily-organizational-context-v01.js';
import { ventasHybridUnresolvedSensitivityV01 } from './motors/ventas-hybrid-unresolved-sensitivity-v01.js';
import { ventasIdentityCoverageV01 } from './motors/ventas-identity-coverage-v01.js';
import { ventasMonthlyActualV01 } from './motors/ventas-monthly-actual-v01.js';
import { ventasMonthlyDedupSensitivityV01 } from './motors/ventas-monthly-dedup-sensitivity-v01.js';
import { ventasOrganizationalContextV01 } from './motors/ventas-organizational-context-v01.js';
import { ventasProductConcentrationV01 } from './motors/ventas-product-concentration-v01.js';
import { ventasProductDetailV01 } from './motors/ventas-product-detail-v01.js';
import { ventasProductModelResolutionAuditV01 } from './motors/ventas-product-model-resolution-audit-v01.js';
import { ventasProductSalesV01 } from './motors/ventas-product-sales-v01.js';
import { ventasUnresolvedRecognitionEvidenceV01 } from './motors/ventas-unresolved-recognition-evidence-v01.js';

export { CUSTOM_GPT_TABLES };

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
  ventas_monthly_actual_v01: ventasMonthlyActualV01,
  ventas_daily_context_v01: ventasDailyContextV01,
  ventas_daily_organizational_context_v01: ventasDailyOrganizationalContextV01,
  daily_close_backtest_context_v01: dailyCloseBacktestContextV01,
  daily_close_forecast_backtest_v01: dailyCloseForecastBacktestV01,
  intramonth_sales_history_context_v01: intramonthSalesHistoryContextV01,
  ventas_product_sales_v01: ventasProductSalesV01,
  ventas_product_detail_v01: ventasProductDetailV01,
  ventas_product_concentration_v01: ventasProductConcentrationV01,
  ventas_product_model_resolution_audit_v01: ventasProductModelResolutionAuditV01,
  ventas_organizational_context_v01: ventasOrganizationalContextV01,
  expected_monthly_backtest_v01: expectedMonthlyBacktestV01,
  expected_monthly_stability_v01: expectedMonthlyStabilityV01,
  expected_monthly_candidates_v01: expectedMonthlyCandidatesV01,
  competitive_context_v01: competitiveContextV01,
  competitive_share_trajectory_v01: competitiveShareTrajectoryV01,
  competitive_signal_backtest_v01: competitiveSignalBacktestV01,
  competitive_relation_v01: competitiveRelationV01,
  product_generation_context_v01: productGenerationContextV01,
  organizational_share_expectation_backtest_v01: organizationalShareExpectationBacktestV01,
  organizational_relative_performance_v01: organizationalRelativePerformanceV01,
  org_sales_deterioration_backtest_v01: orgSalesDeteriorationBacktestV01,
  org_sales_deterioration_episode_evidence_v01: orgSalesDeteriorationEpisodeEvidenceV01,
  org_sales_deterioration_status_v01: orgSalesDeteriorationStatusV01,
  org_sales_observation_semantics_audit_v01: orgSalesObservationSemanticsAuditV01,
});

export function listCustomGptActions() {
  return Object.keys(ACTIONS);
}

export async function runCustomGptAction(action, input = {}) {
  const run = ACTIONS[action];
  if (!run) throw new Error('Unknown Custom GPT action');
  return run(input);
}
