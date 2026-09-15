import { ExecutionAttemptStatus, TechnicalErrorClass } from '../enums.js';
import { clone, fingerprint, invariant } from '../primitives.js';
import { getCapabilityContract } from '../planning/capabilityCatalog.js';
import { validateApplicabilityDecisionV2, validatePhysicalExecutionAuthorization } from '../planning/contracts.js';
import { validateProtocolState } from '../runtime/contracts.js';
import { createExecutionAttempt, validateExecuteAuthorizationCommand } from './contracts.js';

function now(clock) {
  const value = new Date(typeof clock === 'function' ? clock() : clock);
  invariant(Number.isFinite(value.getTime()), 'CLOCK_REQUIRED', '$.clock'); return value.toISOString();
}
function attemptBase(authorization, attemptId, attemptVersion, previous) {
  return {
    contract_version: 'execution_attempt.v1', execution_attempt_id: attemptId, attempt_version: attemptVersion,
    protocol_id: authorization.protocol_id, state_version_at_authorization: authorization.state_version,
    authorization_ref: { authorization_id: authorization.authorization_id, authorization_fingerprint: authorization.authorization_fingerprint },
    execution_fingerprint: authorization.execution_fingerprint, capability_ref: clone(authorization.capability),
    motor_ref: authorization.physical_request.motor_ref, previous_attempt_fingerprint: previous?.attempt_fingerprint ?? 'GENESIS',
  };
}
function classify(error) {
  if (error?.code === 'TIMEOUT') return { status: ExecutionAttemptStatus.TIMED_OUT, class: TechnicalErrorClass.TIMEOUT, retryable: true };
  if (error?.code === 'CANCELLED') return { status: ExecutionAttemptStatus.CANCELLED, class: TechnicalErrorClass.CANCELLED, retryable: false };
  if (error?.code === 'UNEXPECTED_RESULT_SHAPE' || error?.code === 'AMBIGUOUS_RESULT_POINT' || error?.code === 'AUTHORIZED_RESULT_POINT_MISSING' || String(error?.code || '').startsWith('PHYSICAL_')) return { status: ExecutionAttemptStatus.FAILED_FINAL, class: TechnicalErrorClass.UNEXPECTED_RESULT_SHAPE, retryable: false };
  if (error?.code === 'EXECUTOR_NOT_FOUND') return { status: ExecutionAttemptStatus.FAILED_FINAL, class: TechnicalErrorClass.EXECUTOR_ERROR, retryable: false };
  return { status: error?.retryable === true ? ExecutionAttemptStatus.FAILED_RETRYABLE : ExecutionAttemptStatus.FAILED_FINAL, class: TechnicalErrorClass.MOTOR_ERROR, retryable: error?.retryable === true };
}

export function validateAuthorizationForExecution(state, authorization, command, { applicabilityDecisions = [] } = {}) {
  validateProtocolState(state); validatePhysicalExecutionAuthorization(authorization); validateExecuteAuthorizationCommand(command);
  invariant(command.protocol_id === state.protocol_id && authorization.protocol_id === state.protocol_id, 'PROTOCOL_MISMATCH', '$.protocol_id');
  invariant(command.expected_state_version === state.state_version, 'STALE_STATE_VERSION', '$.expected_state_version');
  invariant(state.status === 'EXECUTING' && state.pending_execution_objective?.status === 'AUTHORIZED', 'AUTHORIZATION_NOT_EXECUTABLE', '$.status');
  invariant(command.authorization_ref.authorization_id === authorization.authorization_id && command.authorization_ref.authorization_fingerprint === authorization.authorization_fingerprint && command.authorization_ref.execution_fingerprint === authorization.execution_fingerprint, 'AUTHORIZATION_MISMATCH', '$.authorization_ref');
  const stateRef = state.physical_authorization_refs.find(ref => ref.authorization_id === authorization.authorization_id);
  invariant(stateRef && stateRef.authorization_fingerprint === authorization.authorization_fingerprint && stateRef.execution_fingerprint === authorization.execution_fingerprint, 'AUTHORIZATION_MISMATCH', '$.physical_authorization_refs');
  invariant(state.pending_execution_objective.authorization_ref.authorization_fingerprint === authorization.authorization_fingerprint, 'AUTHORIZATION_SUPERSEDED', '$.pending_execution_objective');
  const capability = getCapabilityContract(authorization.capability.capability_id);
  invariant(capability.capability_version === authorization.capability.capability_version && capability.contract_fingerprint === authorization.capability.capability_contract_fingerprint, 'CAPABILITY_CONTRACT_MISMATCH', '$.authorization.capability');
  const decision = applicabilityDecisions.find(item => item.decision_id === authorization.applicability.decision_id);
  invariant(decision, 'APPLICABILITY_DECISION_MISSING', '$.applicabilityDecisions'); validateApplicabilityDecisionV2(decision);
  invariant(decision.status === authorization.applicability.status && decision.decision_fingerprint === authorization.applicability.decision_fingerprint && decision.capability_contract_ref === capability.contract_fingerprint, 'APPLICABILITY_DECISION_MISMATCH', '$.authorization.applicability');
  invariant(authorization.status === 'AUTHORIZED_READY' && authorization.authorized_claim_types.length > 0, 'AUTHORIZATION_NOT_EXECUTABLE', '$.authorization.status');
  return { capability, decision };
}

async function defaultMotorResolver(motorRef) {
  const { getMotor } = await import('../../motors/index.js'); return getMotor(motorRef);
}

export async function executeAuthorizedMotor(state, authorization, command, {
  applicabilityDecisions = [], previousAttempts = [], motorResolver = defaultMotorResolver,
  resultValidator = null, clock, execution_attempt_id,
} = {}) {
  validateAuthorizationForExecution(state, authorization, command, { applicabilityDecisions });
  const same = previousAttempts.filter(item => item.execution_fingerprint === authorization.execution_fingerprint);
  invariant(!same.some(item => item.status === 'SUCCEEDED'), 'EXECUTION_ALREADY_SUCCEEDED', '$.previousAttempts');
  if (same.length) invariant(same.at(-1).status === 'FAILED_RETRYABLE', 'EXECUTION_NOT_RETRYABLE', '$.previousAttempts');
  const id = execution_attempt_id ?? `attempt_${authorization.execution_fingerprint.slice(-16)}_${same.length + 1}`;
  const authorized = createExecutionAttempt({ ...attemptBase(authorization, id, 1, same.at(-1)), status: 'AUTHORIZED' });
  const started = now(clock);
  const running = createExecutionAttempt({ ...attemptBase(authorization, id, 2, authorized), status: 'RUNNING', started_at: started });
  let rawResult;
  try {
    const motor = await motorResolver(authorization.physical_request.motor_ref);
    invariant(typeof motor === 'function', 'EXECUTOR_NOT_FOUND', '$.motor_ref');
    const physicalInput = clone(authorization.physical_request.validated_input);
    rawResult = await motor(physicalInput);
    invariant(JSON.stringify(physicalInput) === JSON.stringify(authorization.physical_request.validated_input), 'PHYSICAL_REQUEST_MUTATED', '$.physical_request');
    if (resultValidator) resultValidator(rawResult, authorization);
    const finished = now(clock);
    const succeeded = createExecutionAttempt({ ...attemptBase(authorization, id, 3, running), status: 'SUCCEEDED', started_at: started, finished_at: finished, result_ref: fingerprint({ raw_result: rawResult }) });
    return Object.freeze({ attempt: succeeded, lifecycle: Object.freeze([authorized, running, succeeded]), rawResult });
  } catch (error) {
    const outcome = classify(error), finished = now(clock);
    const failed = createExecutionAttempt({ ...attemptBase(authorization, id, 3, running), status: outcome.status, started_at: started, finished_at: finished, error: { class: outcome.class, code: String(error?.code || 'MOTOR_EXECUTION_FAILED'), retryable: outcome.retryable } });
    return Object.freeze({ attempt: failed, lifecycle: Object.freeze([authorized, running, failed]), error: failed.error });
  }
}
