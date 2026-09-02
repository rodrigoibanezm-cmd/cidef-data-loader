import { buildOrgDeteriorationRuntime } from '../deterioration/buildOrgDeteriorationRuntime.js';
import { buildCurrentDeteriorationStatus } from '../deterioration/buildCurrentDeteriorationStatus.js';
import {
  DETERIORATION_STATUS_RULE,
  parseDeteriorationStatusInput,
} from '../deterioration/deteriorationStatusInput.js';

export const ENGINE_NAME = 'org_sales_deterioration_status_v01';
export const ENGINE_VERSION = '0.1';

export async function orgSalesDeteriorationStatusV01(input = {}) {
  const parsed = parseDeteriorationStatusInput(input);
  const runtime = await buildOrgDeteriorationRuntime(parsed);
  const snapshot = runtime.snapshots.snapshots.get(parsed.cutoffMonth);
  const result = buildCurrentDeteriorationStatus(
    runtime.backtest.allRows,
    snapshot?.units || new Map(),
    parsed.cutoffMonth,
  );
  const warnings = [...new Set([
    ...runtime.snapshots.context_warnings,
    ...runtime.observed.warnings,
  ])];
  const validation = {
    ventas_contexts_ok: runtime.snapshots.contexts_ok,
    fixed_rule: true,
    unknown_not_zero_filled: true,
    persistence_breaks_on_unknown: true,
    statuses_reconcile: result.statuses.length === Object.values(result.counts).reduce((a, b) => a + b, 0),
    unique_units: new Set(result.statuses.map((row) => String(row.unit_id))).size === result.statuses.length,
    no_future_rows: result.statuses.every((row) => row.persistence_rows.every(
      (evidence) => evidence.month <= parsed.cutoffMonth,
    )),
  };
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: Object.values(validation).every(Boolean) && !warnings.length ? 'ok' : 'warning',
    inputs: { cutoff_month: parsed.cutoffMonth },
    policy: {
      family: 'Familia 3 - DETERIORO Y RED FLAGS',
      mode: 'CURRENT_SNAPSHOT',
      target_month: 'closed calendar month only in America/Santiago',
      grain: DETERIORATION_STATUS_RULE.grain,
      baseline: DETERIORATION_STATUS_RULE.baseline,
      deviation_method: DETERIORATION_STATUS_RULE.deviation,
      persistence_rule: DETERIORATION_STATUS_RULE.persistence,
      active_episode: 'confirmed episode remains active while observations stay adverse; non-adverse or UNKNOWN ends continuity',
    },
    summary: { cutoff_month: parsed.cutoffMonth, units: result.statuses.length, ...result.counts },
    units: result.statuses,
    observation_semantics: runtime.observed.audit,
    warnings,
    validation,
  };
}
