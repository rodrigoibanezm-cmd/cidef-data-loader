export const GoalType = Object.freeze({
  OBSERVED_RESULT: 'OBSERVED_RESULT',
  TEMPORAL_TRAJECTORY: 'TEMPORAL_TRAJECTORY',
  RELATIVE_PERFORMANCE: 'RELATIVE_PERFORMANCE',
  MARKET_POSITION: 'MARKET_POSITION',
});
export const EvidenceClass = Object.freeze({ REQUIRED: 'REQUIRED', OPTIONAL: 'OPTIONAL' });
export const ClaimType = Object.freeze({ OBSERVED_VALUE: 'OBSERVED_VALUE' });
export const ApplicabilityStatus = Object.freeze({
  APPLICABLE: 'APPLICABLE',
  APPLICABLE_WITH_LIMITED_COVERAGE: 'APPLICABLE_WITH_LIMITED_COVERAGE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});
export const GoalStatus = Object.freeze({ PENDING: 'PENDING', SATISFIED: 'SATISFIED', NOT_EVALUABLE: 'NOT_EVALUABLE' });
export const GoalOrigin = Object.freeze({
  USER_EXPRESSED: 'USER_EXPRESSED', USER_SELECTED: 'USER_SELECTED',
  INITIAL_CANDIDATE: 'INITIAL_CANDIDATE', SYSTEM_DERIVED: 'SYSTEM_DERIVED',
});
export const ProtocolStatus = Object.freeze({
  GROUNDING: 'GROUNDING', AWAITING_SELECTION: 'AWAITING_SELECTION', EXECUTING: 'EXECUTING',
  ASSESSING: 'ASSESSING', COMPLETE: 'COMPLETE', TERMINAL_PARTIAL: 'TERMINAL_PARTIAL',
});
export const ResolutionStatus = Object.freeze({
  RESOLVED: 'RESOLVED', UNRESOLVED: 'UNRESOLVED', AMBIGUOUS: 'AMBIGUOUS',
  NOT_FOUND: 'NOT_FOUND', NOT_AUTHORIZED: 'NOT_AUTHORIZED', UNSUPPORTED: 'UNSUPPORTED',
});
export const Certification = Object.freeze({ CERTIFIED: 'CERTIFIED', UNCERTIFIED: 'UNCERTIFIED' });

export const AuthorityType = Object.freeze({
  PRODUCT_MASTER: 'PRODUCT_MASTER', PERSON_MASTER: 'PERSON_MASTER', STORE_MASTER: 'STORE_MASTER',
  SALES_UNIVERSE: 'SALES_UNIVERSE', RVM_UNIVERSE: 'RVM_UNIVERSE', CRM_AUTHORITY: 'CRM_AUTHORITY',
  TEMPORAL_POLICY: 'TEMPORAL_POLICY',
});

export const PHYSICAL_FIELDS = new Set([
  'capability', 'capability_id', 'capability_name', 'capability_contract_ref', 'motor', 'engine',
  'table', 'table_name', 'sql', 'physical_request', 'request_projector', 'request_projector_ref',
  'private_request', 'execution_input', 'physical_input', 'executor', 'physical_executor_ref',
  'execution_authorization', 'applicability_reasoning',
]);

export const SYNTHESIS_FORBIDDEN_FIELDS = new Set([
  ...PHYSICAL_FIELDS, 'raw', 'raw_payload', 'motor_payload', 'evidence_ledger', 'rejected_evidence',
  'applicability_decision', 'applicability_decision_ref', 'proof', 'proof_steps', 'execution_fingerprint',
]);
