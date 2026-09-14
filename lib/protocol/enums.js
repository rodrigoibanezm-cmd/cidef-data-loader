export const GoalType = Object.freeze({ OBSERVED_RESULT: 'OBSERVED_RESULT' });
export const EvidenceClass = Object.freeze({ REQUIRED: 'REQUIRED', OPTIONAL: 'OPTIONAL' });
export const ClaimType = Object.freeze({ OBSERVED_VALUE: 'OBSERVED_VALUE' });
export const ApplicabilityStatus = Object.freeze({
  APPLICABLE: 'APPLICABLE',
  APPLICABLE_WITH_LIMITED_COVERAGE: 'APPLICABLE_WITH_LIMITED_COVERAGE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});
export const GoalStatus = Object.freeze({ PENDING: 'PENDING', SATISFIED: 'SATISFIED', NOT_EVALUABLE: 'NOT_EVALUABLE' });
export const ResolutionStatus = Object.freeze({ RESOLVED: 'RESOLVED', UNRESOLVED: 'UNRESOLVED' });
export const Certification = Object.freeze({ CERTIFIED: 'CERTIFIED', UNCERTIFIED: 'UNCERTIFIED' });

export const PHYSICAL_FIELDS = new Set([
  'capability', 'capability_id', 'capability_name', 'capability_contract_ref', 'motor', 'engine',
  'table', 'table_name', 'sql', 'physical_request', 'request_projector', 'request_projector_ref',
  'executor', 'physical_executor_ref', 'execution_authorization', 'applicability_reasoning',
]);

export const SYNTHESIS_FORBIDDEN_FIELDS = new Set([
  ...PHYSICAL_FIELDS, 'raw', 'raw_payload', 'motor_payload', 'evidence_ledger', 'rejected_evidence',
  'applicability_decision', 'applicability_decision_ref', 'proof', 'proof_steps', 'execution_fingerprint',
]);
