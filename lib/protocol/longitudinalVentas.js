import { createCapabilityContract, validateGoalInstance, validateUniverseResolution } from './contracts.js';
import { deepFreeze, invariant } from './primitives.js';

// Audited against lib/longitudinal/ventas.js at WP01 baseline HEAD.
// This is intentionally the certified subset needed by the first target slice.
export const LONGITUDINAL_VENTAS_CAPABILITY = createCapabilityContract({
  contract_version: 'capability_contract.v1',
  capability_contract_id: 'LONGITUDINAL/VENTAS',
  supports: {
    goal_types: ['OBSERVED_RESULT'],
    entity_types: ['BRAND'],
    measures: ['VIN_SALES'],
    commercial_universes: ['COMPANY'],
    organization_scopes: ['CIDEF'],
    period_units: ['MONTH'],
    period_statuses: ['CLOSED'],
    period_alignments: ['CALENDAR'],
    comparisons: ['NONE'],
    grains: ['BRAND'],
  },
  authority_requirements: { identity: true, membership: true },
  availability_requirements: { status: 'AVAILABLE', through_period_end: true, minimum_coverage_ratio: 1 },
  permitted_claim_types: ['OBSERVED_VALUE'],
  physical_executor_ref: 'ventas_longitudinal_context_v01',
  request_projector_ref: 'protocol.request.longitudinal_ventas.v1',
  evidence_projector_ref: 'protocol.evidence.observed_value.v1',
});

export function projectLongitudinalVentasRequest(goal, resolution) {
  validateGoalInstance(goal); validateUniverseResolution(resolution);
  invariant(goal.universe_resolution_ref === resolution.resolution_fingerprint, 'RESOLUTION_REFERENCE_MISMATCH', '$.universe_resolution_ref');
  const binding = goal.bindings;
  invariant(binding.subject.canonical_id === resolution.subject.canonical_id, 'SUBJECT_BINDING_MISMATCH', '$.bindings.subject');
  return deepFreeze({
    action: 'ventas_longitudinal_context_v01',
    input: {
      metric: binding.measure,
      grain: binding.grain,
      filters: { brand_id: binding.subject.canonical_id },
      commercial_universe: binding.commercial_universe,
      date_from: binding.period.date_from,
      date_to: binding.period.date_to,
      time_grain: binding.period.unit,
      cutoff_mode: 'FULL_PERIOD',
    },
  });
}
