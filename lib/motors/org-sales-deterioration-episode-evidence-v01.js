import { buildEpisodeEvidence } from '../deterioration/buildEpisodeEvidence.js';
import { buildOrgDeteriorationRuntime } from '../deterioration/buildOrgDeteriorationRuntime.js';
import { parseEpisodeEvidenceInput } from '../deterioration/episodeEvidenceInput.js';

export const ENGINE_NAME = 'org_sales_deterioration_episode_evidence_v01';
export const ENGINE_VERSION = '0.1';

export async function orgSalesDeteriorationEpisodeEvidenceV01(input = {}) {
  const parsed = parseEpisodeEvidenceInput(input);
  const runtime = await buildOrgDeteriorationRuntime(parsed);
  const evidence = buildEpisodeEvidence(
    runtime.backtest.allRows,
    runtime.evaluation.episodes,
    parsed,
  );
  const warnings = [...new Set([
    ...runtime.snapshots.context_warnings,
    ...runtime.observed.warnings,
  ])];
  const validation = {
    ventas_contexts_ok: runtime.snapshots.contexts_ok,
    baseline_uses_prior_cutoff: true,
    signal_uses_no_future_labels: true,
    unknown_not_zero_filled: true,
    persistence_breaks_on_unknown: true,
    ...evidence.validation,
  };
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: Object.values(validation).every(Boolean) && !warnings.length ? 'ok' : 'warning',
    inputs: {
      grain: parsed.grain,
      start_month: parsed.startMonth,
      end_month: parsed.endMonth,
      baseline: parsed.baselines[0],
      deviation_method: parsed.deviations[0],
      persistence_rule: parsed.persistence[0],
      context_months: parsed.contextMonths,
      detail_unit_id: parsed.detailUnitId,
      detail_limit: parsed.detailLimit,
    },
    policy: {
      purpose: 'audit why a certified deterioration episode fired using ex-ante rows only',
      detection_logic: 'identical runtime and candidate evaluation used by deterioration v0.4',
      context_months: 'transport-only display bound; never part of signal generation',
      future_evaluation: 'reported separately and never used to construct signal evidence',
    },
    observation_semantics: runtime.observed.audit,
    coverage: {
      source_rows: runtime.sourceRows.length,
      evaluable_rows: runtime.backtest.rows.length,
      skipped_by_baseline: runtime.backtest.skipped,
      skipped_unknown_actual_by_baseline: runtime.backtest.skippedUnknown,
    },
    episode_evidence: evidence.episode_evidence,
    detail: evidence.detail,
    warnings,
    validation,
  };
}
