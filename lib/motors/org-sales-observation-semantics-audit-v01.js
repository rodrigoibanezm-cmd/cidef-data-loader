import { parseObservationAuditInput } from '../observation-semantics/observationAuditInput.js';
import { buildObservationSemanticsAudit } from '../observation-semantics/buildObservationSemanticsAudit.js';
import { formatObservationAudit } from '../observation-semantics/formatObservationAudit.js';

export const ENGINE_NAME = 'org_sales_observation_semantics_audit_v01';
export const ENGINE_VERSION = '0.1';

const POLICY = Object.freeze({
  mode: 'AUDIT_ONLY',
  phase: 'DISCOVERY_ONLY',
  candidate: 'last_year + relative + deepening_2',
  observed_positive: 'recognized_sales > 0 -> sales = recognized_sales',
  active_zero: 'recognized_sales = 0 and nv_count > 0 -> sales = 0',
  unknown: 'recognized_sales = 0 and nv_count = 0 -> no evaluable row',
  nv_semantics: 'NV proves observed commercial activity; NV never increments sales',
  unit_universe: 'stores already observed in the production recognized-sales snapshot history',
});

export async function orgSalesObservationSemanticsAuditV01(input = {}) {
  const parsed = parseObservationAuditInput(input);
  const result = await buildObservationSemanticsAudit(parsed);
  const allValid = Object.values(result.validation).every(Boolean);
  const base = {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    mode: 'AUDIT_ONLY',
    status: allValid && !result.warnings.length ? 'ok' : 'warning',
    inputs: {
      start_month: parsed.startMonth,
      end_month: parsed.endMonth,
      detail_limit: parsed.detailLimit,
      detail_unit_id: parsed.detailUnitId == null ? null : Number(parsed.detailUnitId),
    },
    policy: POLICY,
    validation: result.validation,
    nv_identity: result.nv_identity,
    nv_time: result.nv_time,
    new_backtest_skips: result.new_backtest_skips,
    warnings: result.warnings,
  };
  return formatObservationAudit({ ...result, base }, parsed);
}
