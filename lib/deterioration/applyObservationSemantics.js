import { loadNvEvidence } from '../observation-semantics/loadNvEvidence.js';
import { resolveNvIdentity } from '../observation-semantics/resolveNvIdentity.js';
import { indexNvMonths } from '../observation-semantics/indexNvMonths.js';
import { buildObservationSnapshots } from '../observation-semantics/buildObservationSnapshots.js';

export async function applyObservationSemantics(snapshotSet, parsed) {
  if (parsed.grain !== 'tienda') {
    return {
      snapshots: snapshotSet,
      audit: {
        mode: 'POSITIVE_ONLY_UNKNOWN',
        active_zero_supported: false,
        note: 'seller ACTIVE_ZERO has no independently certified monthly activity source',
      },
      warnings: ['seller ACTIVE_ZERO evidence unavailable; no-sale months remain UNKNOWN'],
    };
  }

  const nvRows = await loadNvEvidence();
  const nvIdentity = resolveNvIdentity(nvRows);
  const nvTime = indexNvMonths(nvIdentity.rows);
  const snapshots = buildObservationSnapshots(snapshotSet, nvTime.counts);
  const warnings = [];
  if (nvIdentity.audit.unresolved_rows) warnings.push('some NV rows have unresolved store identity');
  if (nvTime.audit.unparseable_rows) warnings.push('some NV rows have unparseable fecha_nota_de_venta');

  return {
    snapshots,
    audit: {
      mode: 'OBSERVED_POSITIVE_ACTIVE_ZERO_UNKNOWN',
      active_zero_supported: true,
      nv_source_rows: nvRows.length,
      nv_identity: nvIdentity.audit,
      nv_time: nvTime.audit,
    },
    warnings,
  };
}
