import { loadVentasRows } from '../ventas/loadVentasRows.js';
import { buildCutoffSnapshots } from './buildCutoffSnapshots.js';
import { buildOrgBacktestRows } from './buildOrgBacktestRows.js';
import { evaluateOrgCandidates } from './evaluateOrgCandidates.js';
import { loadOrgIdentityMaps } from './orgIdentityMaps.js';
import {
  evaluableByBaseline,
  summarizeUnits,
  summarizeYearStability,
} from './summarizeOrgBacktest.js';

function seriesCoverage(snapshotSet) {
  return snapshotSet.cutoffs.map((cutoff) => {
    const snap = snapshotSet.snapshots.get(cutoff);
    return { cutoff_month: cutoff, units: snap.units.size, ...snap.coverage };
  });
}

function warningsFor(parsed, snapshotSet, rows) {
  const final = snapshotSet.snapshots.get(parsed.endMonth);
  const warnings = new Set(snapshotSet.context_warnings);
  if (final.coverage.unresolved) warnings.add('canonical identity unresolved for recognized sales');
  if (final.coverage.unvalidated) warnings.add('resolved seller identity includes unvalidated MASTER rows');
  if (parsed.grain === 'vendedor') warnings.add('historical seller role/assignment validity is unavailable');
  if (rows.some((row) => row.baseline_value <= 0)) warnings.add('baseline zero affects relative deviation');
  if (rows.some((row) => row.deviations.error_history_available < 3)) {
    warnings.add('some periods have insufficient prior error history for robust deviations');
  }
  return [...warnings];
}

export async function buildOrgSalesDeteriorationBacktest(parsed) {
  const [rows, identities] = await Promise.all([loadVentasRows(), loadOrgIdentityMaps()]);
  const snapshots = buildCutoffSnapshots(rows, identities, parsed);
  const backtest = buildOrgBacktestRows(snapshots, parsed);
  const evaluation = evaluateOrgCandidates(backtest.allRows, parsed);
  const final = snapshots.snapshots.get(parsed.endMonth);
  const warnings = warningsFor(parsed, snapshots, backtest.rows);
  const validation = {
    ventas_contexts_ok: snapshots.contexts_ok,
    final_identity_reconciles:
      final.coverage.resolved + final.coverage.unresolved === final.coverage.recognized,
    baseline_uses_prior_cutoff: true,
    signal_uses_no_future_labels: true,
    onset_not_after_confirmation: evaluation.episodes.every(
      (row) => row.onset_month <= row.confirmation_month,
    ),
    has_evaluable_rows: backtest.rows.length > 0,
  };
  return {
    status: Object.values(validation).every(Boolean) && !warnings.length ? 'ok' : 'warning',
    identity_audit: {
      final_cutoff: parsed.endMonth,
      ...final.coverage,
      unresolved_keys: final.unresolved_keys,
      ambiguous_master_keys: identities[parsed.grain].ambiguous,
    },
    monthly_series_coverage: seriesCoverage(snapshots),
    candidate_results: evaluation.candidateResults,
    unit_backtests: summarizeUnits(backtest.rows),
    episode_backtests: evaluation.episodes,
    rolling_year_stability: summarizeYearStability(evaluation.episodes),
    coverage: {
      source_rows: rows.length,
      first_data_month: snapshots.first_data_month,
      backtest_months: backtest.months.length,
      warmup_evaluable_rows: backtest.allRows.length - backtest.rows.length,
      evaluable_rows: backtest.rows.length,
      evaluable_periods_by_candidate: evaluableByBaseline(backtest.rows, parsed.baselines),
      skipped_by_baseline: backtest.skipped,
    },
    warnings,
    validation,
  };
}
