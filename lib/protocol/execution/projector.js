import { clone, invariant, sameCanonical } from '../primitives.js';
import { createEvidenceRecordV2, createTypedClaim } from './contracts.js';

function monthKey(period) { return period.date_from.slice(0, 7); }
function fullCalendarMonth(period) {
  const end = new Date(`${period.date_from.slice(0, 7)}-01T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  return period.date_from.endsWith('-01') && period.date_to === end.toISOString().slice(0, 10);
}
function authorityFingerprints(authorization) {
  return [authorization.authority_refs.identity_ref.authority_fingerprint,
    ...authorization.authority_refs.membership_refs.map(ref => ref.authority_fingerprint),
    authorization.authority_refs.temporal_ref.authority_fingerprint];
}

export function validateLongitudinalVentasRawResult(raw, authorization) {
  invariant(raw && typeof raw === 'object' && !Array.isArray(raw), 'UNEXPECTED_RESULT_SHAPE', '$.raw_result');
  const binding = authorization.semantic_binding;
  invariant(authorization.capability.capability_id === 'LONGITUDINAL/VENTAS', 'CAPABILITY_MISMATCH', '$.authorization.capability');
  invariant(authorization.physical_request.evidence_projector_ref === 'protocol.evidence.observed_value.v1', 'EVIDENCE_PROJECTOR_MISMATCH', '$.authorization.physical_request.evidence_projector_ref');
  invariant(binding.subject.entity_type === 'BRAND' && binding.measure === 'VIN_SALES' && binding.commercial_universe === 'COMPANY' && binding.organization_scope === 'CIDEF' && binding.grain === 'BRAND' && binding.comparison === 'NONE', 'UNSUPPORTED_EVIDENCE_BINDING', '$.authorization.semantic_binding');
  invariant(binding.period.period_status === 'CLOSED' && binding.period.unit === 'MONTH' && binding.period.alignment === 'CALENDAR' && fullCalendarMonth(binding.period), 'UNSUPPORTED_EVIDENCE_PERIOD', '$.authorization.semantic_binding.period');
  invariant(raw.motor === authorization.physical_request.motor_ref && raw.domain === 'VENTAS', 'UNEXPECTED_RESULT_SHAPE', '$.raw_result.motor');
  invariant(raw.metric === binding.measure && raw.grain === binding.grain && raw.timeGrain === 'MONTH', 'UNEXPECTED_RESULT_SHAPE', '$.raw_result');
  invariant(raw.dateFrom === binding.period.date_from && raw.dateTo === binding.period.date_to, 'PHYSICAL_PERIOD_MISMATCH', '$.raw_result');
  invariant(raw.commercial_scope?.universe === binding.commercial_universe && raw.commercial_validation?.valid === true, 'PHYSICAL_UNIVERSE_MISMATCH', '$.raw_result.commercial_scope');
  invariant(sameCanonical(raw.filters?.brand_id, [binding.subject.canonical_id]), 'PHYSICAL_SUBJECT_MISMATCH', '$.raw_result.filters.brand_id');
  invariant(raw.temporalSemantics?.requestedDateFrom === binding.period.date_from && raw.temporalSemantics?.requestedDateTo === binding.period.date_to && raw.temporalSemantics?.lastPeriodComplete === true, 'PHYSICAL_PERIOD_MISMATCH', '$.raw_result.temporalSemantics');
  invariant(Array.isArray(raw.series), 'UNEXPECTED_RESULT_SHAPE', '$.raw_result.series');
  invariant(raw.series.length === 1, raw.series.some(point => point?.period === monthKey(binding.period)) ? 'AMBIGUOUS_RESULT_POINT' : 'AUTHORIZED_RESULT_POINT_MISSING', '$.raw_result.series');
  const matches = raw.series.filter(point => point?.period === monthKey(binding.period));
  invariant(matches.length === 1, matches.length ? 'AMBIGUOUS_RESULT_POINT' : 'AUTHORIZED_RESULT_POINT_MISSING', '$.raw_result.series');
  invariant(typeof matches[0].value === 'number' && Number.isFinite(matches[0].value), 'UNEXPECTED_RESULT_SHAPE', '$.raw_result.series.value');
  return matches[0];
}

export function projectObservedValue({ authorization, executionAttempt, rawResult, observed_at, admitted_at, evidence_id, question_contract_ref = 'VIA_PROTOCOL_STATE' }) {
  const point = validateLongitudinalVentasRawResult(rawResult, authorization);
  invariant(authorization.authorized_claim_types.includes('OBSERVED_VALUE'), 'CLAIM_NOT_AUTHORIZED', '$.authorization.authorized_claim_types');
  const binding = authorization.semantic_binding;
  const authority_refs = authorityFingerprints(authorization);
  const claim = createTypedClaim({
    contract_version: 'typed_claim.v1', claim_type: 'OBSERVED_VALUE',
    subject: { canonical_id: binding.subject.canonical_id, entity_type: binding.subject.entity_type }, measure: binding.measure,
    value: { amount: point.value, unit: 'VIN' },
    period: { date_from: binding.period.date_from, date_to: binding.period.date_to, period_status: binding.period.period_status, alignment: binding.period.alignment },
    commercial_universe: binding.commercial_universe, organization_scope: binding.organization_scope,
    grain: binding.grain, comparison: binding.comparison, authority_refs,
    source_execution_ref: { execution_fingerprint: authorization.execution_fingerprint, execution_attempt_fingerprint: executionAttempt.attempt_fingerprint },
  });
  return createEvidenceRecordV2({
    contract_version: 'evidence_record.v2', evidence_id: evidence_id ?? `evidence_${claim.claim_fingerprint.slice(-16)}`, evidence_version: 1,
    protocol_id: authorization.protocol_id, goal_refs: [authorization.goal_ref], action_ref: clone(authorization.selected_action_ref),
    authorization_ref: { authorization_id: authorization.authorization_id, authorization_fingerprint: authorization.authorization_fingerprint },
    execution_attempt_ref: { execution_attempt_fingerprint: executionAttempt.attempt_fingerprint }, capability: clone(authorization.capability),
    semantic_binding: clone(binding), claims: [claim], coverage: { status: 'CERTIFIED', ratio: 1, threshold_met: true },
    comparability: { status: 'NOT_REQUIRED', mode: 'NONE' }, authority_refs, availability_snapshot_ref: authorization.availability_snapshot_ref,
    execution_fingerprint: authorization.execution_fingerprint, observed_at, admitted_at,
    provenance: {
      question_contract_ref, goal_ref: authorization.goal_ref,
      action_fingerprint: authorization.selected_action_ref.action_fingerprint,
      authorization_fingerprint: authorization.authorization_fingerprint,
      capability_contract_fingerprint: authorization.capability.capability_contract_fingerprint,
      execution_attempt_fingerprint: executionAttempt.attempt_fingerprint,
      availability_snapshot_ref: authorization.availability_snapshot_ref,
      typed_claim_fingerprints: [claim.claim_fingerprint],
    },
  });
}

export const TARGET_EVIDENCE_PROJECTORS = Object.freeze({
  'protocol.evidence.observed_value.v1': projectObservedValue,
});
