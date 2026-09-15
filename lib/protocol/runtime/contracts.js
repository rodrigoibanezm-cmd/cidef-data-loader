import {
  createGoalInstance, validateAction, validateAvailabilitySnapshot, validateGoalInstance,
  validateQuestionContract, validateUniverseResolution,
} from '../contracts.js';
import { EvidenceClass, GoalOrigin, GoalStatus, GoalType, PHYSICAL_FIELDS, ProtocolStatus } from '../enums.js';
import {
  clone, deepFreeze, finalizeWithHash, fingerprint, invariant, rejectKeysDeep, rejectUnknown, requireArray,
  requireEnum, requireObject, requireString, verifyHash,
} from '../primitives.js';

const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const RUNTIME_FORBIDDEN=new Set([...PHYSICAL_FIELDS,'decision_plan','question_family','continuationtoken','continuation_token','evidence_ledger','evidence_records']);

function integer(value,path,{minimum=0}={}){invariant(Number.isInteger(value)&&value>=minimum,'INVALID_INTEGER',path);}
function strings(value,path){requireArray(value,path);value.forEach((item,index)=>requireString(item,`${path}[${index}]`));invariant(new Set(value).size===value.length,'DUPLICATE_VALUE',path);}
function instant(value,path){invariant(TIMESTAMP.test(value||''),'INVALID_TIMESTAMP',path);}
function validateSemanticBindings(bindings){
  createGoalInstance({contract_version:'goal_instance.v1',goal_id:'binding_validation',question_contract_ref:'binding_validation',universe_resolution_ref:'binding_validation',goal_type:'OBSERVED_RESULT',evidence_class:'REQUIRED',origin:'USER_EXPRESSED',status:'PENDING',bindings:clone(bindings)});
}

export function validateInitialGoalCandidate(value,path='$'){
  rejectUnknown(value,['contract_version','candidate_id','goal_type','semantic_label','description','bindings','evidence_class_if_selected','origin','expected_claim_types','limitations','candidate_fingerprint'],path);
  requireEnum(value.contract_version,['initial_goal_candidate.v1'],`${path}.contract_version`);requireString(value.candidate_id,`${path}.candidate_id`);requireEnum(value.goal_type,Object.values(GoalType),`${path}.goal_type`);requireString(value.semantic_label,`${path}.semantic_label`);requireString(value.description,`${path}.description`);validateSemanticBindings(value.bindings);requireEnum(value.evidence_class_if_selected,[EvidenceClass.REQUIRED],`${path}.evidence_class_if_selected`);requireEnum(value.origin,['DEFERRED_SEMANTIC_SELECTION'],`${path}.origin`);strings(value.expected_claim_types,`${path}.expected_claim_types`);strings(value.limitations,`${path}.limitations`);rejectKeysDeep(value,RUNTIME_FORBIDDEN,path);verifyHash(value,'candidate_fingerprint',['candidate_id']);return true;
}
export function createInitialGoalCandidate(draft){const output=finalizeWithHash(draft,'candidate_fingerprint',['candidate_id']);validateInitialGoalCandidate(output);return output;}

export function validateSelectActionCommand(value){
  rejectUnknown(value,['contract_version','command_id','protocol_id','expected_state_version','action_id','action_fingerprint','command_fingerprint'],'$');requireEnum(value.contract_version,['select_action_command.v1'],'$.contract_version');for(const key of ['command_id','protocol_id','action_id','action_fingerprint'])requireString(value[key],`$.${key}`);integer(value.expected_state_version,'$.expected_state_version',{minimum:1});rejectKeysDeep(value,RUNTIME_FORBIDDEN,'$');verifyHash(value,'command_fingerprint',['command_id']);return true;
}
export function createSelectActionCommand(draft){const output=finalizeWithHash(draft,'command_fingerprint',['command_id']);validateSelectActionCommand(output);return output;}

function validateSelectionRef(value,path){
  if(value?.status==='OMITTED'){rejectUnknown(value,['status'],path);return;}
  rejectUnknown(value,['action_id','action_fingerprint','selected_at','source_state_version'],path);requireString(value.action_id,`${path}.action_id`);requireString(value.action_fingerprint,`${path}.action_fingerprint`);instant(value.selected_at,`${path}.selected_at`);integer(value.source_state_version,`${path}.source_state_version`,{minimum:1});
}
function validatePendingObjective(value,path){
  if(value?.status==='OMITTED'){rejectUnknown(value,['status'],path);return;}
  rejectUnknown(value,['status','goal_id','goal_fingerprint','semantic_label','selected_action_fingerprint','objective_fingerprint','authorization_ref'],path);requireEnum(value.status,['PENDING','AUTHORIZED'],`${path}.status`);requireString(value.goal_id,`${path}.goal_id`);requireString(value.goal_fingerprint,`${path}.goal_fingerprint`);requireString(value.semantic_label,`${path}.semantic_label`);requireString(value.selected_action_fingerprint,`${path}.selected_action_fingerprint`);requireString(value.objective_fingerprint,`${path}.objective_fingerprint`);invariant(value.objective_fingerprint===fingerprint({goal_fingerprint:value.goal_fingerprint,semantic_label:value.semantic_label,selected_action_fingerprint:value.selected_action_fingerprint}),'FINGERPRINT_MISMATCH',`${path}.objective_fingerprint`);if(value.status==='AUTHORIZED'){rejectUnknown(value.authorization_ref,['authorization_id','authorization_fingerprint','execution_fingerprint'],`${path}.authorization_ref`);for(const key of ['authorization_id','authorization_fingerprint','execution_fingerprint'])requireString(value.authorization_ref[key],`${path}.authorization_ref.${key}`);}else invariant(!Object.hasOwn(value,'authorization_ref'),'PENDING_OBJECTIVE_HAS_AUTHORIZATION',`${path}.authorization_ref`);
}
function validateAuthorizationRef(value,path){rejectUnknown(value,['authorization_id','authorization_fingerprint','execution_fingerprint','goal_fingerprint','source_state_version'],path);for(const key of ['authorization_id','authorization_fingerprint','execution_fingerprint','goal_fingerprint'])requireString(value[key],`${path}.${key}`);integer(value.source_state_version,`${path}.source_state_version`,{minimum:1});}

export function validateProtocolState(value){
  rejectUnknown(value,['contract_version','protocol_id','protocol_version','state_version','status','question_contract_ref','question_contract_hash','universe_resolution_ref','universe_resolution_fingerprint','availability_snapshot_ref','availability_snapshot_fingerprint','goals','initial_goal_candidates','open_obligations','actions','selected_action_ref','pending_execution_objective','physical_authorization_refs','execution_attempt_refs','admitted_evidence_refs','sufficiency_evaluation_refs','consumed_action_fingerprints','budget','terminal','previous_state_hash','state_hash','created_at','updated_at'],'$');
  requireEnum(value.contract_version,['protocol_state.v1'],'$.contract_version');requireString(value.protocol_id,'$.protocol_id');invariant(value.protocol_version===1,'INVALID_VERSION','$.protocol_version');integer(value.state_version,'$.state_version',{minimum:1});requireEnum(value.status,Object.values(ProtocolStatus),'$.status');
  for(const key of ['question_contract_ref','question_contract_hash','universe_resolution_ref','universe_resolution_fingerprint','availability_snapshot_ref','availability_snapshot_fingerprint','previous_state_hash'])requireString(value[key],`$.${key}`);
  requireArray(value.goals,'$.goals');value.goals.forEach((item)=>validateGoalInstance(item));invariant(new Set(value.goals.map(item=>item.goal_id)).size===value.goals.length,'DUPLICATE_GOAL','$.goals');
  requireArray(value.initial_goal_candidates,'$.initial_goal_candidates');value.initial_goal_candidates.forEach((item,index)=>validateInitialGoalCandidate(item,`$.initial_goal_candidates[${index}]`));
  strings(value.open_obligations,'$.open_obligations');const pending=new Set(value.goals.filter(item=>item.status===GoalStatus.PENDING&&[EvidenceClass.REQUIRED,EvidenceClass.CONDITIONAL].includes(item.evidence_class)).map(item=>item.goal_id));invariant(value.open_obligations.length===pending.size&&value.open_obligations.every(id=>pending.has(id)),'INVALID_OPEN_OBLIGATION','$.open_obligations');
  requireArray(value.actions,'$.actions');value.actions.forEach(validateAction);invariant(new Set(value.actions.map(item=>item.action_id)).size===value.actions.length,'DUPLICATE_ACTION','$.actions');value.actions.forEach(item=>invariant(item.protocol_id===value.protocol_id,'ACTION_PROTOCOL_MISMATCH','$.actions'));
  validateSelectionRef(value.selected_action_ref,'$.selected_action_ref');validatePendingObjective(value.pending_execution_objective,'$.pending_execution_objective');requireArray(value.physical_authorization_refs,'$.physical_authorization_refs');value.physical_authorization_refs.forEach((item,index)=>validateAuthorizationRef(item,`$.physical_authorization_refs[${index}]`));invariant(new Set(value.physical_authorization_refs.map(item=>item.goal_fingerprint)).size===value.physical_authorization_refs.length,'DUPLICATE_EXECUTION_AUTHORIZATION','$.physical_authorization_refs');strings(value.consumed_action_fingerprints,'$.consumed_action_fingerprints');
  if(Object.hasOwn(value,'execution_attempt_refs'))strings(value.execution_attempt_refs,'$.execution_attempt_refs');
  if(Object.hasOwn(value,'admitted_evidence_refs'))strings(value.admitted_evidence_refs,'$.admitted_evidence_refs');
  if(Object.hasOwn(value,'sufficiency_evaluation_refs'))strings(value.sufficiency_evaluation_refs,'$.sufficiency_evaluation_refs');
  const satisfiedGoals=value.goals.filter(item=>item.status===GoalStatus.SATISFIED);invariant(satisfiedGoals.length===0||(value.sufficiency_evaluation_refs??[]).length>=satisfiedGoals.length,'SATISFIED_GOAL_REQUIRES_SUFFICIENCY_RUNTIME','$.sufficiency_evaluation_refs');
  rejectUnknown(value.budget,['max_semantic_selections','semantic_selections_used','max_depth'],'$.budget');integer(value.budget.max_semantic_selections,'$.budget.max_semantic_selections',{minimum:1});integer(value.budget.semantic_selections_used,'$.budget.semantic_selections_used');integer(value.budget.max_depth,'$.budget.max_depth',{minimum:1});invariant(value.budget.semantic_selections_used<=value.budget.max_semantic_selections,'SEMANTIC_BUDGET_EXCEEDED','$.budget');
  rejectUnknown(value.terminal,['status','reason_codes'],'$.terminal');requireEnum(value.terminal.status,['OPEN','TERMINAL'],'$.terminal.status');strings(value.terminal.reason_codes,'$.terminal.reason_codes');
  if(value.status===ProtocolStatus.COMPLETE){const blocking=value.goals.filter(item=>[EvidenceClass.REQUIRED,EvidenceClass.CONDITIONAL].includes(item.evidence_class));invariant(blocking.length>0&&blocking.every(item=>item.status===GoalStatus.SATISFIED),'COMPLETE_REQUIRES_SATISFIED_GOALS','$.goals');invariant((value.sufficiency_evaluation_refs??[]).length>=blocking.length,'COMPLETE_REQUIRES_SUFFICIENCY_RUNTIME','$.sufficiency_evaluation_refs');invariant(value.open_obligations.length===0&&value.actions.length===0&&value.initial_goal_candidates.length===0,'COMPLETE_HAS_OPEN_WORK','$');invariant(value.pending_execution_objective.status==='OMITTED','COMPLETE_HAS_ACTIVE_OBJECTIVE','$.pending_execution_objective');invariant(value.terminal.status==='TERMINAL','COMPLETE_REQUIRES_TERMINAL_STATE','$.terminal.status');}
  if(value.status===ProtocolStatus.EXECUTING){invariant(value.pending_execution_objective.status==='AUTHORIZED','EXECUTING_REQUIRES_AUTHORIZATION','$.pending_execution_objective');invariant(value.physical_authorization_refs.length>0,'EXECUTING_REQUIRES_AUTHORIZATION','$.physical_authorization_refs');}
  instant(value.created_at,'$.created_at');instant(value.updated_at,'$.updated_at');invariant(value.created_at<=value.updated_at,'INVALID_STATE_TIME','$.updated_at');rejectKeysDeep(value,RUNTIME_FORBIDDEN,'$');verifyHash(value,'state_hash');return true;
}
export function createProtocolState(draft){const output=finalizeWithHash(draft,'state_hash');validateProtocolState(output);return output;}

export function validateRuntimeInputs(question,resolution,availability){validateQuestionContract(question);validateUniverseResolution(resolution);validateAvailabilitySnapshot(availability);return true;}
export function immutableRuntimeValue(value){return deepFreeze(value);}
export const RuntimeGoalOrigin=GoalOrigin;
