import { CUSTOM_GPT_TABLES } from './custom-gpt/catalog.js';
import { profileTable } from './custom-gpt/profileTable.js';
import { queryTable } from './custom-gpt/queryTable.js';
import { listTables, tableSchema } from './custom-gpt/tableMetadata.js';
import { competitiveContextV01 } from './motors/competitive-context-v01.js';
import { expectedMonthlyBacktestV01 } from './motors/expected-monthly-backtest-v01.js';
import { expectedMonthlyCandidatesV01 } from './motors/expected-monthly-candidates-v01.js';
import { expectedMonthlyStabilityV01 } from './motors/expected-monthly-stability-v01.js';
import { ventasCrossMonthFirstLastAuditV01 } from './motors/ventas-cross-month-first-last-audit-v01.js';
import { ventasHybridUnresolvedSensitivityV01 } from './motors/ventas-hybrid-unresolved-sensitivity-v01.js';
import { ventasMonthlyDedupSensitivityV01 } from './motors/ventas-monthly-dedup-sensitivity-v01.js';
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
  expected_monthly_backtest_v01: expectedMonthlyBacktestV01,
  expected_monthly_stability_v01: expectedMonthlyStabilityV01,
  expected_monthly_candidates_v01: expectedMonthlyCandidatesV01,
  competitive_context_v01: competitiveContextV01,
});

export function listCustomGptActions() {
  return Object.keys(ACTIONS);
}

export async function runCustomGptAction(action, input = {}) {
  const run = ACTIONS[action];
  if (!run) throw new Error('Unknown Custom GPT action');
  return run(input);
}
