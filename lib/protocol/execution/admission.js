import { EvidenceAdmissionPredicate } from '../enums.js';
import { sameCanonical } from '../primitives.js';
import { validatePhysicalExecutionAuthorization } from '../planning/contracts.js';
import { validateTypedClaim, createEvidenceAdmissionDecision, validateEvidenceRecordV2, forbiddenRawEvidenceFields } from './contracts.js';

const REASON = Object.freeze({
  EXECUTION_SUCCEEDED:'EXECUTION_NOT_SUCCEEDED', AUTHORIZATION_VALID:'AUTHORIZATION_INVALID', CAPABILITY_EXACT:'CAPABILITY_MISMATCH', EXECUTION_FINGERPRINT_EXACT:'EXECUTION_FINGERPRINT_MISMATCH',
  PROTOCOL_EXACT:'PROTOCOL_MISMATCH', GOAL_VALID:'GOAL_MISMATCH', ACTION_PROVENANCE_VALID:'ACTION_PROVENANCE_INVALID', SUBJECT_EXACT:'SUBJECT_MISMATCH', MEASURE_EXACT:'MEASURE_MISMATCH',
  COMMERCIAL_UNIVERSE_EXACT:'UNIVERSE_MISMATCH', ORGANIZATION_SCOPE_EXACT:'ORGANIZATION_SCOPE_MISMATCH', PERIOD_EXACT:'PERIOD_MISMATCH', GRAIN_EXACT:'GRAIN_MISMATCH', COMPARISON_EXACT:'COMPARISON_MISMATCH',
  CONSTRAINTS_PRESERVED:'CONSTRAINT_MISMATCH', AUTHORITY_REFS_VALID:'AUTHORITY_MISMATCH', AVAILABILITY_EXACT:'AVAILABILITY_MISMATCH', COVERAGE_SUFFICIENT:'COVERAGE_INSUFFICIENT', COMPARABILITY_SUFFICIENT:'COMPARABILITY_INSUFFICIENT',
  CLAIMS_AUTHORIZED:'CLAIM_NOT_AUTHORIZED', CLAIM_SCHEMA_VALID:'CLAIM_SCHEMA_INVALID', RAW_PAYLOAD_ABSENT:'RAW_PAYLOAD_FORBIDDEN', SUPPORTED_INFERENCE_ONLY:'UNSUPPORTED_INFERENCE', EVIDENCE_UNIQUE:'DUPLICATE_EVIDENCE', EVIDENCE_CURRENT:'STALE_EVIDENCE',
});
function safe(fn) { try { return Boolean(fn()); } catch { return false; } }
function containsForbidden(value) {
  if (Array.isArray(value)) return value.some(containsForbidden);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => forbiddenRawEvidenceFields.has(key.toLowerCase()) || containsForbidden(child));
}
function authorityList(authorization) { return [authorization.authority_refs.identity_ref.authority_fingerprint, ...authorization.authority_refs.membership_refs.map(ref => ref.authority_fingerprint), authorization.authority_refs.temporal_ref.authority_fingerprint]; }
function claimMatches(claim, binding) {
  return sameCanonical(claim.subject, { canonical_id: binding.subject.canonical_id, entity_type: binding.subject.entity_type })
    && claim.measure === binding.measure && claim.commercial_universe === binding.commercial_universe
    && claim.organization_scope === binding.organization_scope && claim.grain === binding.grain
    && claim.comparison === binding.comparison
    && sameCanonical(claim.period, { date_from: binding.period.date_from, date_to: binding.period.date_to, period_status: binding.period.period_status, alignment: binding.period.alignment });
}

export function evaluateEvidenceAdmission(candidate, {
  state, authorization, executionAttempt, capabilityContract, availabilitySnapshot, ledger,
  decision_id = `admission_${candidate?.evidence_fingerprint?.slice(-16) || 'invalid'}`,
} = {}) {
  const binding = authorization?.semantic_binding;
  const goal = state?.goals?.find(item => item.goal_fingerprint === authorization?.goal_ref);
  const checks = {
    EXECUTION_SUCCEEDED: () => executionAttempt?.status === 'SUCCEEDED',
    AUTHORIZATION_VALID: () => { validatePhysicalExecutionAuthorization(authorization); return candidate.authorization_ref.authorization_fingerprint === authorization.authorization_fingerprint; },
    CAPABILITY_EXACT: () => sameCanonical(candidate.capability, authorization.capability) && capabilityContract.contract_fingerprint === authorization.capability.capability_contract_fingerprint,
    EXECUTION_FINGERPRINT_EXACT: () => candidate.execution_fingerprint === authorization.execution_fingerprint && executionAttempt.execution_fingerprint === authorization.execution_fingerprint,
    PROTOCOL_EXACT: () => candidate.protocol_id === state.protocol_id && candidate.protocol_id === authorization.protocol_id,
    GOAL_VALID: () => Boolean(goal) && candidate.goal_refs.length === 1 && candidate.goal_refs[0] === goal.goal_fingerprint && goal.status === 'PENDING',
    ACTION_PROVENANCE_VALID: () => sameCanonical(candidate.action_ref, authorization.selected_action_ref) && state.selected_action_ref.action_fingerprint === candidate.action_ref.action_fingerprint,
    SUBJECT_EXACT: () => sameCanonical(candidate.semantic_binding.subject, binding.subject) && candidate.claims.every(claim => sameCanonical(claim.subject, { canonical_id: binding.subject.canonical_id, entity_type: binding.subject.entity_type })),
    MEASURE_EXACT: () => candidate.semantic_binding.measure === binding.measure && candidate.claims.every(claim => claim.measure === binding.measure),
    COMMERCIAL_UNIVERSE_EXACT: () => candidate.semantic_binding.commercial_universe === binding.commercial_universe && candidate.claims.every(claim => claim.commercial_universe === binding.commercial_universe),
    ORGANIZATION_SCOPE_EXACT: () => candidate.semantic_binding.organization_scope === binding.organization_scope && candidate.claims.every(claim => claim.organization_scope === binding.organization_scope),
    PERIOD_EXACT: () => sameCanonical(candidate.semantic_binding.period, binding.period) && candidate.claims.every(claim => claimMatches(claim, binding)),
    GRAIN_EXACT: () => candidate.semantic_binding.grain === binding.grain && candidate.claims.every(claim => claim.grain === binding.grain),
    COMPARISON_EXACT: () => candidate.semantic_binding.comparison === binding.comparison && candidate.claims.every(claim => claim.comparison === binding.comparison),
    CONSTRAINTS_PRESERVED: () => sameCanonical(candidate.semantic_binding.explicit_constraints, binding.explicit_constraints),
    AUTHORITY_REFS_VALID: () => sameCanonical(candidate.authority_refs, authorityList(authorization)) && candidate.claims.every(claim => sameCanonical(claim.authority_refs, candidate.authority_refs)),
    AVAILABILITY_EXACT: () => candidate.availability_snapshot_ref === authorization.availability_snapshot_ref && availabilitySnapshot.snapshot_fingerprint === authorization.availability_snapshot_ref,
    COVERAGE_SUFFICIENT: () => candidate.coverage.threshold_met === true && candidate.coverage.ratio >= capabilityContract.availability_requirements.minimum_coverage_ratio,
    COMPARABILITY_SUFFICIENT: () => capabilityContract.comparability_requirements.required ? candidate.comparability.status === 'CERTIFIED' : candidate.comparability.status === 'NOT_REQUIRED' && candidate.comparability.mode === 'NONE',
    CLAIMS_AUTHORIZED: () => candidate.claims.length > 0 && candidate.claims.every(claim => authorization.authorized_claim_types.includes(claim.claim_type) && capabilityContract.evidence.authorized_claim_types.includes(claim.claim_type)),
    CLAIM_SCHEMA_VALID: () => candidate.claims.every(claim => validateTypedClaim(claim)),
    RAW_PAYLOAD_ABSENT: () => !containsForbidden(candidate),
    SUPPORTED_INFERENCE_ONLY: () => candidate.claims.every(claim => capabilityContract.satisfies.claim_types.includes(claim.claim_type)),
    EVIDENCE_UNIQUE: () => !ledger.records.some(record => record.evidence_fingerprint === candidate.evidence_fingerprint),
    EVIDENCE_CURRENT: () => state.status === 'EXECUTING' && state.pending_execution_objective?.authorization_ref?.authorization_fingerprint === authorization.authorization_fingerprint,
  };
  const predicate_results = EvidenceAdmissionPredicate.map(predicate => {
    const passed = safe(checks[predicate]); return passed ? { predicate, passed } : { predicate, passed, reason_code: REASON[predicate] };
  });
  const reason_codes = [...new Set(predicate_results.filter(item => !item.passed).map(item => item.reason_code))];
  // A malformed record cannot hide behind a valid embedded claim.
  if (safe(() => validateEvidenceRecordV2(candidate)) === false && !reason_codes.includes('CLAIM_SCHEMA_INVALID')) reason_codes.push('CLAIM_SCHEMA_INVALID');
  return createEvidenceAdmissionDecision({ contract_version:'evidence_admission_decision.v1', decision_id, protocol_id:state?.protocol_id ?? candidate?.protocol_id ?? 'invalid', evidence_fingerprint:candidate?.evidence_fingerprint ?? 'invalid', status:reason_codes.length ? 'REJECTED' : 'ADMITTED', predicate_results, reason_codes });
}
