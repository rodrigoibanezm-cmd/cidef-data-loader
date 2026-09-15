import { validateAvailabilitySnapshot, validateGoalInstance, validateUniverseResolution } from '../contracts.js';
import { clone, fingerprint, invariant } from '../primitives.js';
import { createProtocolState, validateProtocolState } from '../runtime/contracts.js';
import { listCapabilityContracts } from './capabilityCatalog.js';
import { createPhysicalExecutionAuthorization, validateAuthorizeExecutionCommand } from './contracts.js';
import { TARGET_REQUEST_PROJECTORS, validateLongitudinalVentasProjection } from './projector.js';
import { selectPhysicalCapability } from './selection.js';

function clockValue(clock) { const instant = new Date(typeof clock === 'function' ? clock() : clock); invariant(Number.isFinite(instant.getTime()), 'CLOCK_REQUIRED', '$.clock'); return instant.toISOString(); }
function resolutionRefMatches(state, resolution) { return state.universe_resolution_fingerprint === resolution.resolution_fingerprint && (state.universe_resolution_ref === resolution.resolution_id || state.universe_resolution_ref === resolution.resolution_fingerprint); }

export function buildExecutionFingerprintPayload({ goal, capabilityContract, universeResolution, availabilitySnapshot, physicalRequest, authorizedClaimTypes }) {
  return {
    goal_fingerprint: goal.goal_fingerprint,
    capability_id: capabilityContract.capability_id,
    capability_version: capabilityContract.capability_version,
    capability_contract_fingerprint: capabilityContract.contract_fingerprint,
    semantic_binding: clone(goal.bindings),
    comparison: goal.comparison ?? 'NONE',
    explicit_constraints: clone(goal.explicit_constraints ?? []),
    authority_refs: clone(universeResolution.authority),
    availability_snapshot_fingerprint: availabilitySnapshot.snapshot_fingerprint,
    physical_request: clone(physicalRequest),
    authorized_claim_types: [...authorizedClaimTypes].sort(),
  };
}

export function authorizeExecution(state, command, {
  universeResolution,
  availabilitySnapshot,
  capabilityContracts = listCapabilityContracts(),
  requestProjectors = TARGET_REQUEST_PROJECTORS,
  clock,
  authorization_id,
} = {}) {
  validateProtocolState(state); validateAuthorizeExecutionCommand(command); validateUniverseResolution(universeResolution); validateAvailabilitySnapshot(availabilitySnapshot);
  invariant(command.protocol_id === state.protocol_id, 'PROTOCOL_MISMATCH', '$.protocol_id');
  invariant(command.expected_state_version === state.state_version, 'STALE_STATE_VERSION', '$.expected_state_version');
  invariant(state.status === 'AWAITING_SELECTION', 'INVALID_STATE_TRANSITION', '$.status');
  invariant(state.selected_action_ref?.action_id === command.selected_action_ref.action_id && state.selected_action_ref?.action_fingerprint === command.selected_action_ref.action_fingerprint, 'SELECTED_ACTION_MISMATCH', '$.selected_action_ref');
  invariant(state.pending_execution_objective?.status === 'PENDING', 'PENDING_EXECUTION_OBJECTIVE_REQUIRED', '$.pending_execution_objective');
  invariant(state.pending_execution_objective.objective_fingerprint === command.pending_objective_fingerprint, 'PENDING_OBJECTIVE_FINGERPRINT_MISMATCH', '$.pending_objective_fingerprint');
  invariant(resolutionRefMatches(state, universeResolution), 'UNIVERSE_RESOLUTION_MISMATCH', '$.universeResolution');
  invariant(state.availability_snapshot_ref === availabilitySnapshot.snapshot_id && state.availability_snapshot_fingerprint === availabilitySnapshot.snapshot_fingerprint, 'AVAILABILITY_SNAPSHOT_MISMATCH', '$.availabilitySnapshot');
  const goal = state.goals.find(item => item.goal_id === state.pending_execution_objective.goal_id);
  invariant(goal, 'PENDING_OBJECTIVE_GOAL_MISMATCH', '$.pending_execution_objective.goal_id'); validateGoalInstance(goal);
  invariant(goal.goal_fingerprint === state.pending_execution_objective.goal_fingerprint, 'PENDING_OBJECTIVE_GOAL_MISMATCH', '$.pending_execution_objective.goal_fingerprint');
  invariant(goal.status === 'PENDING', 'GOAL_NOT_PENDING', '$.goals');
  invariant(!state.physical_authorization_refs.some(item => item.goal_fingerprint === goal.goal_fingerprint), 'DUPLICATE_EXECUTION_AUTHORIZATION', '$.physical_authorization_refs');
  const selection = selectPhysicalCapability({ pendingExecutionObjective: state.pending_execution_objective, goal, capabilityContracts, universeResolution, availabilitySnapshot });
  invariant(selection.selected, 'NO_APPLICABLE_CAPABILITY', '$.capabilityContracts');
  const { capability, decision } = selection.selected;
  const projector = requestProjectors[capability.capability_id]; invariant(typeof projector === 'function', 'REQUEST_PROJECTOR_NOT_REGISTERED', '$.capability_id');
  const physicalRequest = projector({ goal, capabilityContract: capability, universeResolution, availabilitySnapshot });
  if (capability.capability_id === 'LONGITUDINAL/VENTAS') validateLongitudinalVentasProjection(physicalRequest, { goal, capabilityContract: capability, universeResolution });
  const execution_fingerprint = fingerprint(buildExecutionFingerprintPayload({ goal, capabilityContract: capability, universeResolution, availabilitySnapshot, physicalRequest, authorizedClaimTypes: decision.authorized_claim_types }));
  const now = clockValue(clock);
  const authorization = createPhysicalExecutionAuthorization({
    contract_version: 'execution_authorization.v2', authorization_id: authorization_id ?? `authorization_${execution_fingerprint.slice(-16)}`, protocol_id: state.protocol_id, state_version: state.state_version,
    selected_action_ref: { action_id: state.selected_action_ref.action_id, action_fingerprint: state.selected_action_ref.action_fingerprint }, goal_ref: goal.goal_fingerprint,
    capability: { capability_id: capability.capability_id, capability_version: capability.capability_version, capability_contract_fingerprint: capability.contract_fingerprint },
    applicability: { decision_id: decision.decision_id, status: decision.status, decision_fingerprint: decision.decision_fingerprint },
    semantic_binding: { ...clone(goal.bindings), comparison: goal.comparison ?? 'NONE', explicit_constraints: clone(goal.explicit_constraints ?? []) },
    authority_refs: clone(universeResolution.authority), availability_snapshot_ref: availabilitySnapshot.snapshot_fingerprint, physical_request: clone(physicalRequest), authorized_claim_types: clone(decision.authorized_claim_types), execution_fingerprint, issued_at: now, status: 'AUTHORIZED_READY',
  });
  const authorizationRef = { authorization_id: authorization.authorization_id, authorization_fingerprint: authorization.authorization_fingerprint, execution_fingerprint, goal_fingerprint: goal.goal_fingerprint, source_state_version: state.state_version };
  const nextState = createProtocolState({ ...clone(state), state_version: state.state_version + 1, status: 'EXECUTING', actions: [], pending_execution_objective: { ...clone(state.pending_execution_objective), status: 'AUTHORIZED', authorization_ref: { authorization_id: authorization.authorization_id, authorization_fingerprint: authorization.authorization_fingerprint, execution_fingerprint } }, physical_authorization_refs: [...state.physical_authorization_refs, authorizationRef], previous_state_hash: state.state_hash, updated_at: now, state_hash: undefined });
  return Object.freeze({ state: nextState, authorization, applicability_decisions: selection.decisions, physical_selection: Object.freeze({ capability_id: capability.capability_id, capability_contract_fingerprint: capability.contract_fingerprint }) });
}
