import { createAvailabilitySnapshot, createGoalInstance, createUniverseResolution } from '../../lib/protocol/contracts.js';
import { clone } from '../../lib/protocol/primitives.js';
import { createSelectActionCommand, selectAction } from '../../lib/protocol/runtime/index.js';
import { buildFocusedRuntimeFixture } from '../../lib/protocol/runtime/fixtures.js';
import { createAuthorizeExecutionCommand, createNativeCapabilityContract } from '../../lib/protocol/planning/index.js';

export const AUTH_CLOCK='2026-09-15T12:02:00.000Z';
export function reCapability(value, mutate){const draft=clone(value);delete draft.contract_fingerprint;mutate(draft);return createNativeCapabilityContract(draft);}
export function reGoal(value, mutate){const draft=clone(value);delete draft.goal_fingerprint;mutate(draft);return createGoalInstance(draft);}
export function reResolution(value, mutate){const draft=clone(value);delete draft.resolution_fingerprint;mutate(draft);return createUniverseResolution(draft);}
export function reAvailability(value, mutate){const draft=clone(value);delete draft.snapshot_fingerprint;mutate(draft);return createAvailabilitySnapshot(draft);}
export async function selectedFocused(){const fixture=await buildFocusedRuntimeFixture();const action=fixture.state.actions[0];const command=createSelectActionCommand({contract_version:'select_action_command.v1',command_id:'select_for_authorization',protocol_id:fixture.state.protocol_id,expected_state_version:fixture.state.state_version,action_id:action.action_id,action_fingerprint:action.action_fingerprint});const state=selectAction(fixture.state,command,{clock:'2026-09-15T12:01:00.000Z'});return {...fixture,state};}
export function authorizationCommand(state,overrides={}){return createAuthorizeExecutionCommand({contract_version:'authorize_execution_command.v1',command_id:'authorize_fixture',protocol_id:state.protocol_id,expected_state_version:state.state_version,selected_action_ref:{action_id:state.selected_action_ref.action_id,action_fingerprint:state.selected_action_ref.action_fingerprint},pending_objective_fingerprint:state.pending_execution_objective.objective_fingerprint,...overrides});}
