import { loadVentasRows } from '../ventas/loadVentasRows.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import { buildCutoffSnapshots } from '../deterioration/buildCutoffSnapshots.js';
import { buildOrgBacktestRows } from '../deterioration/buildOrgBacktestRows.js';
import { evaluateOrgCandidates } from '../deterioration/evaluateOrgCandidates.js';
import { loadNvEvidence } from './loadNvEvidence.js';
import { resolveNvIdentity } from './resolveNvIdentity.js';
import { indexNvMonths } from './indexNvMonths.js';
import { buildObservationSnapshots } from './buildObservationSnapshots.js';
import { buildSparseBacktestRows } from './buildSparseBacktestRows.js';
import { summarizeObservationStates } from './summarizeObservationStates.js';
import { evaluateSparseEpisodes } from './evaluateSparseEpisodes.js';
import { compareSemantics } from './compareSemantics.js';

const fixedCandidate = (input) => ({
  grain: 'tienda', startMonth: input.startMonth, endMonth: input.endMonth,
  baselines: ['last_year'], deviations: ['relative'], persistence: ['deepening_2'],
});

export async function buildObservationSemanticsAudit(input) {
  const [ventasRows, identities, nvRows] = await Promise.all([
    loadVentasRows(), loadOrganizationalIdentityMaps(), loadNvEvidence(),
  ]);
  const parsed = fixedCandidate(input);
  const oldSnapshots = buildCutoffSnapshots(ventasRows, identities, parsed);
  const oldBacktest = buildOrgBacktestRows(oldSnapshots, parsed);
  const oldEvaluation = evaluateOrgCandidates(oldBacktest.allRows, parsed);

  const nvIdentity = resolveNvIdentity(nvRows);
  const nvTime = indexNvMonths(nvIdentity.rows);
  const newSnapshots = buildObservationSnapshots(oldSnapshots, nvTime.counts);
  const newBacktest = buildSparseBacktestRows(newSnapshots, parsed);
  const newEvaluation = evaluateSparseEpisodes(newBacktest.allRows, parsed);
  const states = summarizeObservationStates(oldSnapshots, newSnapshots, parsed);
  const comparison = compareSemantics(oldBacktest, oldEvaluation, newBacktest, newEvaluation);
  const candidate = oldEvaluation.candidateResults[0];

  const validation = {
    ventas_context_ok: oldSnapshots.contexts_ok,
    nv_identity_ok: nvIdentity.audit.ambiguous_rows === 0,
    nv_time_ok: nvTime.audit.unparseable_rows === 0,
    old_semantics_reconciles: candidate?.episodes === oldEvaluation.episodes.length,
    unknown_preserved:
      states.coverage.observed_positive_unit_months
        + states.coverage.active_zero_unit_months
        + states.coverage.unknown_unit_months
        === states.coverage.unit_months_total,
  };
  const warnings = [];
  if (nvIdentity.audit.unresolved_rows) warnings.push('some NV rows have unresolved store identity');
  if (nvTime.audit.unparseable_rows) warnings.push('some NV rows have unparseable fecha_nota_de_venta');

  return {
    nv_identity: nvIdentity.audit, nv_time: nvTime.audit,
    units: states.units, coverage: states.coverage,
    ...comparison,
    validation, warnings,
    new_backtest_skips: {
      missing_baseline: newBacktest.skippedMissingBaseline,
      unknown_actual: newBacktest.skippedUnknownActual,
    },
  };
}
