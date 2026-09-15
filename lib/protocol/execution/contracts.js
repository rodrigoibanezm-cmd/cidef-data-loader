import {
  EvidenceAdmissionPredicate, EvidenceAdmissionReason, EvidenceAdmissionStatus,
  ExecutionAttemptStatus, TechnicalErrorClass,
} from '../enums.js';
import {
  clone, finalizeWithHash, invariant, rejectKeysDeep, rejectUnknown, requireArray,
  requireEnum, requireObject, requireString, verifyHash,
} from '../primitives.js';
import { createGoalInstance } from '../contracts.js';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RAW_FIELDS = new Set(['raw', 'raw_payload', 'motor_payload', 'response_payload', 'context_payload', 'sql', 'debug']);

function integer(value, path, minimum = 0) {
  invariant(Number.isInteger(value) && value >= minimum, 'INVALID_INTEGER', path);
}
function instant(value, path, optional = false) {
  if (optional && value == null) return;
  invariant(TIMESTAMP.test(value || ''), 'INVALID_TIMESTAMP', path);
}
function strings(value, path, { nonEmpty = false } = {}) {
  requireArray(value, path, { nonEmpty });
  value.forEach((item, index) => requireString(item, `${path}[${index}]`));
  invariant(new Set(value).size === value.length, 'DUPLICATE_VALUE', path);
}
function ref(value, keys, path) {
  rejectUnknown(value, keys, path);
  keys.forEach(key => requireString(value[key], `${path}.${key}`));
}
function semanticBinding(value, path) {
  requireObject(value, path);
  const bindings = clone(value); const comparison = bindings.comparison; const explicit_constraints = bindings.explicit_constraints;
  delete bindings.comparison; delete bindings.explicit_constraints;
  createGoalInstance({ contract_version:'goal_instance.v1', goal_id:'evidence_binding_validation', question_contract_ref:'evidence_binding_validation', universe_resolution_ref:'evidence_binding_validation', goal_type:'OBSERVED_RESULT', evidence_class:'REQUIRED', origin:'USER_EXPRESSED', status:'PENDING', bindings, comparison, explicit_constraints });
}

export function validateExecuteAuthorizationCommand(value) {
  rejectUnknown(value, ['contract_version', 'command_id', 'protocol_id', 'expected_state_version', 'authorization_ref', 'command_fingerprint'], '$');
  requireEnum(value.contract_version, ['execute_authorization_command.v1'], '$.contract_version');
  requireString(value.command_id, '$.command_id'); requireString(value.protocol_id, '$.protocol_id');
  integer(value.expected_state_version, '$.expected_state_version', 1);
  ref(value.authorization_ref, ['authorization_id', 'authorization_fingerprint', 'execution_fingerprint'], '$.authorization_ref');
  verifyHash(value, 'command_fingerprint', ['command_id']);
  return true;
}
export function createExecuteAuthorizationCommand(draft) {
  const value = finalizeWithHash(draft, 'command_fingerprint', ['command_id']);
  validateExecuteAuthorizationCommand(value); return value;
}

export function validateExecutionAttempt(value) {
  rejectUnknown(value, ['contract_version', 'execution_attempt_id', 'attempt_version', 'protocol_id', 'state_version_at_authorization', 'authorization_ref', 'execution_fingerprint', 'capability_ref', 'motor_ref', 'status', 'started_at', 'finished_at', 'result_ref', 'error', 'previous_attempt_fingerprint', 'attempt_fingerprint'], '$');
  requireEnum(value.contract_version, ['execution_attempt.v1'], '$.contract_version');
  for (const key of ['execution_attempt_id', 'protocol_id', 'execution_fingerprint', 'motor_ref', 'previous_attempt_fingerprint']) requireString(value[key], `$.${key}`);
  integer(value.attempt_version, '$.attempt_version', 1); integer(value.state_version_at_authorization, '$.state_version_at_authorization', 1);
  ref(value.authorization_ref, ['authorization_id', 'authorization_fingerprint'], '$.authorization_ref');
  ref(value.capability_ref, ['capability_id', 'capability_version', 'capability_contract_fingerprint'], '$.capability_ref');
  requireEnum(value.status, Object.values(ExecutionAttemptStatus), '$.status');
  instant(value.started_at, '$.started_at', true); instant(value.finished_at, '$.finished_at', true);
  if (Object.hasOwn(value, 'result_ref')) requireString(value.result_ref, '$.result_ref');
  if (Object.hasOwn(value, 'error')) {
    rejectUnknown(value.error, ['class', 'code', 'retryable'], '$.error');
    requireEnum(value.error.class, Object.values(TechnicalErrorClass), '$.error.class'); requireString(value.error.code, '$.error.code');
    invariant(typeof value.error.retryable === 'boolean', 'INVALID_BOOLEAN', '$.error.retryable');
  }
  if (value.status === ExecutionAttemptStatus.AUTHORIZED) invariant(!value.started_at && !value.finished_at && !value.error && !value.result_ref, 'INVALID_EXECUTION_LIFECYCLE', '$');
  if (value.status === ExecutionAttemptStatus.RUNNING) invariant(Boolean(value.started_at) && !value.finished_at && !value.error && !value.result_ref, 'INVALID_EXECUTION_LIFECYCLE', '$');
  if (value.status === ExecutionAttemptStatus.SUCCEEDED) invariant(Boolean(value.started_at && value.finished_at && value.result_ref) && !value.error, 'INVALID_EXECUTION_LIFECYCLE', '$');
  if (['FAILED_RETRYABLE', 'FAILED_FINAL', 'TIMED_OUT', 'CANCELLED'].includes(value.status)) invariant(Boolean(value.started_at && value.finished_at && value.error) && !value.result_ref, 'INVALID_EXECUTION_LIFECYCLE', '$');
  verifyHash(value, 'attempt_fingerprint', ['execution_attempt_id']); return true;
}
export function createExecutionAttempt(draft) {
  const value = finalizeWithHash(draft, 'attempt_fingerprint', ['execution_attempt_id']);
  validateExecutionAttempt(value); return value;
}

function validatePeriod(value, path) {
  rejectUnknown(value, ['date_from', 'date_to', 'period_status', 'alignment'], path);
  invariant(DATE.test(value.date_from || '') && DATE.test(value.date_to || '') && value.date_from <= value.date_to, 'INVALID_PERIOD', path);
  requireEnum(value.period_status, ['CLOSED', 'OPEN', 'PARTIAL'], `${path}.period_status`);
  requireEnum(value.alignment, ['CALENDAR', 'ROLLING'], `${path}.alignment`);
}
export function validateTypedClaim(value, path = '$') {
  rejectUnknown(value, ['contract_version', 'claim_type', 'subject', 'measure', 'value', 'period', 'commercial_universe', 'organization_scope', 'grain', 'comparison', 'authority_refs', 'source_execution_ref', 'claim_fingerprint'], path);
  requireEnum(value.contract_version, ['typed_claim.v1'], `${path}.contract_version`); requireEnum(value.claim_type, ['OBSERVED_VALUE'], `${path}.claim_type`);
  ref(value.subject, ['canonical_id', 'entity_type'], `${path}.subject`); requireString(value.measure, `${path}.measure`);
  rejectUnknown(value.value, ['amount', 'unit'], `${path}.value`); invariant(typeof value.value.amount === 'number' && Number.isFinite(value.value.amount), 'INVALID_CLAIM_VALUE', `${path}.value.amount`); requireEnum(value.value.unit, ['VIN'], `${path}.value.unit`);
  validatePeriod(value.period, `${path}.period`); requireString(value.commercial_universe, `${path}.commercial_universe`); requireString(value.organization_scope, `${path}.organization_scope`); requireString(value.grain, `${path}.grain`); requireString(value.comparison, `${path}.comparison`);
  strings(value.authority_refs, `${path}.authority_refs`, { nonEmpty: true });
  ref(value.source_execution_ref, ['execution_fingerprint', 'execution_attempt_fingerprint'], `${path}.source_execution_ref`);
  rejectKeysDeep(value, RAW_FIELDS, path); verifyHash(value, 'claim_fingerprint'); return true;
}
export function createTypedClaim(draft) {
  const value = finalizeWithHash(draft, 'claim_fingerprint'); validateTypedClaim(value); return value;
}

export function validateEvidenceRecordV2(value) {
  rejectUnknown(value, ['contract_version', 'evidence_id', 'evidence_version', 'protocol_id', 'goal_refs', 'action_ref', 'authorization_ref', 'execution_attempt_ref', 'capability', 'semantic_binding', 'claims', 'coverage', 'comparability', 'authority_refs', 'availability_snapshot_ref', 'execution_fingerprint', 'evidence_fingerprint', 'observed_at', 'admitted_at', 'provenance'], '$');
  requireEnum(value.contract_version, ['evidence_record.v2'], '$.contract_version'); requireString(value.evidence_id, '$.evidence_id'); integer(value.evidence_version, '$.evidence_version', 1); requireString(value.protocol_id, '$.protocol_id');
  strings(value.goal_refs, '$.goal_refs', { nonEmpty: true }); ref(value.action_ref, ['action_id', 'action_fingerprint'], '$.action_ref'); ref(value.authorization_ref, ['authorization_id', 'authorization_fingerprint'], '$.authorization_ref'); ref(value.execution_attempt_ref, ['execution_attempt_fingerprint'], '$.execution_attempt_ref');
  ref(value.capability, ['capability_id', 'capability_version', 'capability_contract_fingerprint'], '$.capability'); semanticBinding(value.semantic_binding, '$.semantic_binding');
  requireArray(value.claims, '$.claims', { nonEmpty: true }); value.claims.forEach((claim, index) => validateTypedClaim(claim, `$.claims[${index}]`));
  rejectUnknown(value.coverage, ['status', 'ratio', 'threshold_met'], '$.coverage'); requireEnum(value.coverage.status, ['CERTIFIED', 'LIMITED', 'MISSING'], '$.coverage.status'); invariant(typeof value.coverage.ratio === 'number' && value.coverage.ratio >= 0 && value.coverage.ratio <= 1, 'INVALID_COVERAGE', '$.coverage.ratio'); invariant(typeof value.coverage.threshold_met === 'boolean', 'INVALID_BOOLEAN', '$.coverage.threshold_met');
  rejectUnknown(value.comparability, ['status', 'mode'], '$.comparability'); requireEnum(value.comparability.status, ['NOT_REQUIRED', 'CERTIFIED', 'INSUFFICIENT'], '$.comparability.status'); requireString(value.comparability.mode, '$.comparability.mode');
  strings(value.authority_refs, '$.authority_refs', { nonEmpty: true }); requireString(value.availability_snapshot_ref, '$.availability_snapshot_ref'); requireString(value.execution_fingerprint, '$.execution_fingerprint'); instant(value.observed_at, '$.observed_at'); instant(value.admitted_at, '$.admitted_at'); requireObject(value.provenance, '$.provenance'); invariant(Object.keys(value.provenance).length > 0, 'MISSING_PROVENANCE', '$.provenance');
  rejectKeysDeep(value, RAW_FIELDS, '$'); verifyHash(value, 'evidence_fingerprint', ['evidence_id', 'observed_at', 'admitted_at']); return true;
}
export function createEvidenceRecordV2(draft) {
  const value = finalizeWithHash(draft, 'evidence_fingerprint', ['evidence_id', 'observed_at', 'admitted_at']); validateEvidenceRecordV2(value); return value;
}

export function validateEvidenceAdmissionDecision(value) {
  rejectUnknown(value, ['contract_version', 'decision_id', 'protocol_id', 'evidence_fingerprint', 'status', 'predicate_results', 'reason_codes', 'decision_fingerprint'], '$');
  requireEnum(value.contract_version, ['evidence_admission_decision.v1'], '$.contract_version'); for (const key of ['decision_id', 'protocol_id', 'evidence_fingerprint']) requireString(value[key], `$.${key}`); requireEnum(value.status, Object.values(EvidenceAdmissionStatus), '$.status');
  requireArray(value.predicate_results, '$.predicate_results'); invariant(value.predicate_results.length === EvidenceAdmissionPredicate.length, 'INCOMPLETE_ADMISSION_PREDICATES', '$.predicate_results');
  value.predicate_results.forEach((item, index) => { rejectUnknown(item, ['predicate', 'passed', 'reason_code'], `$.predicate_results[${index}]`); requireEnum(item.predicate, EvidenceAdmissionPredicate, `$.predicate_results[${index}].predicate`); invariant(typeof item.passed === 'boolean', 'INVALID_BOOLEAN', `$.predicate_results[${index}].passed`); if (!item.passed) requireEnum(item.reason_code, EvidenceAdmissionReason, `$.predicate_results[${index}].reason_code`); });
  invariant(new Set(value.predicate_results.map(item => item.predicate)).size === EvidenceAdmissionPredicate.length, 'DUPLICATE_ADMISSION_PREDICATE', '$.predicate_results'); strings(value.reason_codes, '$.reason_codes'); invariant(value.status === 'ADMITTED' ? value.reason_codes.length === 0 : value.reason_codes.length > 0, 'INVALID_ADMISSION_OUTCOME', '$'); verifyHash(value, 'decision_fingerprint', ['decision_id']); return true;
}
export function createEvidenceAdmissionDecision(draft) {
  const value = finalizeWithHash(draft, 'decision_fingerprint', ['decision_id']); validateEvidenceAdmissionDecision(value); return value;
}

export function validateEvidenceLedger(value) {
  rejectUnknown(value, ['contract_version', 'protocol_id', 'ledger_version', 'records', 'previous_ledger_hash', 'ledger_hash'], '$'); requireEnum(value.contract_version, ['evidence_ledger.v1'], '$.contract_version'); requireString(value.protocol_id, '$.protocol_id'); integer(value.ledger_version, '$.ledger_version'); requireArray(value.records, '$.records'); value.records.forEach(validateEvidenceRecordV2); invariant(new Set(value.records.map(record => record.evidence_fingerprint)).size === value.records.length, 'DUPLICATE_EVIDENCE', '$.records'); requireString(value.previous_ledger_hash, '$.previous_ledger_hash'); rejectKeysDeep(value, RAW_FIELDS, '$'); verifyHash(value, 'ledger_hash'); return true;
}
export function createEvidenceLedgerValue(draft) { const value = finalizeWithHash(draft, 'ledger_hash'); validateEvidenceLedger(value); return value; }

export const forbiddenRawEvidenceFields = RAW_FIELDS;
export const cloneEvidenceValue = clone;
