import { loadVentasRows } from '../ventas/loadVentasRows.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import { applyObservationSemantics } from './applyObservationSemantics.js';
import { buildCutoffSnapshots } from './buildCutoffSnapshots.js';
import { buildSparseOrgBacktestRows } from './buildSparseOrgBacktestRows.js';
import { evaluateOrgCandidates } from './evaluateOrgCandidates.js';

export async function buildOrgDeteriorationRuntime(parsed) {
  const [sourceRows, identities] = await Promise.all([
    loadVentasRows(),
    loadOrganizationalIdentityMaps(),
  ]);
  const baseSnapshots = buildCutoffSnapshots(sourceRows, identities, parsed);
  const observed = await applyObservationSemantics(baseSnapshots, parsed);
  const snapshots = observed.snapshots;
  const backtest = buildSparseOrgBacktestRows(snapshots, parsed);
  const evaluation = evaluateOrgCandidates(backtest.allRows, parsed);
  return { sourceRows, identities, observed, snapshots, backtest, evaluation };
}
