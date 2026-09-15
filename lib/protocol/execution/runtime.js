import { clone, invariant } from '../primitives.js';
import { createProtocolState } from '../runtime/contracts.js';
import { getCapabilityContract } from '../planning/capabilityCatalog.js';
import { executeAuthorizedMotor } from './executor.js';
import { TARGET_EVIDENCE_PROJECTORS, validateLongitudinalVentasRawResult } from './projector.js';
import { evaluateEvidenceAdmission } from './admission.js';
import { appendAdmittedEvidence, createEvidenceLedger } from './ledger.js';

function time(clock) {
  const date = new Date(typeof clock === 'function' ? clock() : clock);
  invariant(Number.isFinite(date.getTime()), 'CLOCK_REQUIRED', '$.clock'); return date.toISOString();
}
function stateWithAttempt(state, attempt, clock) {
  return createProtocolState({ ...clone(state), state_version:state.state_version+1,
    execution_attempt_refs:[...(state.execution_attempt_refs ?? []), attempt.attempt_fingerprint],
    previous_state_hash:state.state_hash, updated_at:time(clock), state_hash:undefined });
}

export async function executeAndAdmitEvidence(state, authorization, command, {
  applicabilityDecisions = [], availabilitySnapshot, ledger = createEvidenceLedger(state.protocol_id),
  previousAttempts = [], motorResolver, clock, execution_attempt_id, evidence_id,
  evidenceProjectors = TARGET_EVIDENCE_PROJECTORS,
} = {}) {
  const capabilityContract = getCapabilityContract(authorization.capability.capability_id);
  const executed = await executeAuthorizedMotor(state, authorization, command, {
    applicabilityDecisions, previousAttempts, motorResolver,
    resultValidator:validateLongitudinalVentasRawResult, clock, execution_attempt_id,
  });
  if (executed.attempt.status !== 'SUCCEEDED') {
    return Object.freeze({ state:stateWithAttempt(state, executed.attempt, clock), attempt:executed.attempt, lifecycle:executed.lifecycle, admission:null, evidence:null, ledger, technical_error:executed.error });
  }
  const projector = evidenceProjectors[authorization.physical_request.evidence_projector_ref];
  invariant(typeof projector === 'function', 'EVIDENCE_PROJECTOR_NOT_REGISTERED', '$.authorization.physical_request.evidence_projector_ref');
  const admittedAt = time(clock);
  const candidate = projector({ authorization, executionAttempt:executed.attempt, rawResult:executed.rawResult,
    observed_at:executed.attempt.finished_at, admitted_at:admittedAt, evidence_id,
    question_contract_ref:state.question_contract_hash });
  const admission = evaluateEvidenceAdmission(candidate, { state, authorization, executionAttempt:executed.attempt, capabilityContract, availabilitySnapshot, ledger });
  if (admission.status !== 'ADMITTED') {
    return Object.freeze({ state:stateWithAttempt(state, executed.attempt, clock), attempt:executed.attempt, lifecycle:executed.lifecycle, admission, evidence:candidate, ledger });
  }
  const nextLedger = appendAdmittedEvidence(ledger, admission, candidate);
  const nextState = createProtocolState({ ...clone(state), state_version:state.state_version+1, status:'ASSESSING',
    execution_attempt_refs:[...(state.execution_attempt_refs ?? []), executed.attempt.attempt_fingerprint],
    admitted_evidence_refs:[...(state.admitted_evidence_refs ?? []), candidate.evidence_fingerprint],
    previous_state_hash:state.state_hash, updated_at:admittedAt, state_hash:undefined });
  return Object.freeze({ state:nextState, attempt:executed.attempt, lifecycle:executed.lifecycle, admission, evidence:candidate, ledger:nextLedger });
}
