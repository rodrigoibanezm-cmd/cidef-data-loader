import { createGoalInstance, validateAvailabilitySnapshot, validateQuestionContract, validateUniverseResolution } from '../contracts.js';
import { clone, invariant, sameCanonical } from '../primitives.js';
import { createInitialGoalCandidate } from './contracts.js';

const FOCUSED_PROPOSITIONS=Object.freeze([{
  operation:'OBSERVE',concept:'RESULT',goal_type:'OBSERVED_RESULT',semantic_label:'OBSERVE_SALES_RESULT',
  description:'Observe the certified VIN sales result for the exact semantic bindings.',measure:'VIN_SALES',expected_claim_types:['OBSERVED_VALUE'],
},{operation:'OBSERVE',concept:'COMMERCIAL_CONDITION',goal_type:'OBSERVED_RESULT',semantic_label:'OBSERVE_PUBLISHED_COMMERCIAL_CONDITION',description:'Observe the published commercial condition valid for the exact product version and period.',measure:'PUBLISHED_COMMERCIAL_CONDITION',expected_claim_types:['OBSERVED_COMMERCIAL_CONDITION']}]);
const BROAD_PROPOSITIONS=Object.freeze([
  {goal_type:'OBSERVED_RESULT',semantic_label:'OBSERVE_SALES_RESULT',description:'Review the observed sales result.',measure:'VIN_SALES',claims:['OBSERVED_VALUE']},
  {goal_type:'TEMPORAL_TRAJECTORY',semantic_label:'REVIEW_TEMPORAL_TRAJECTORY',description:'Review the temporal trajectory.',measure:'VIN_SALES',claims:['TRAJECTORY_SERIES']},
  {goal_type:'RELATIVE_PERFORMANCE',semantic_label:'COMPARE_RELATIVE_PERFORMANCE',description:'Compare relative performance.',measure:'VIN_SALES',claims:['RELATIVE_PERFORMANCE_VALUE']},
  {goal_type:'MARKET_POSITION',semantic_label:'REVIEW_MARKET_POSITION',description:'Review market position.',measure:'MARKET_SHARE',claims:['MARKET_POSITION_VALUE']},
]);

function axisValue(value,path){if(typeof value==='string')return value;invariant(value?.status==='BOUND','UNBOUND_RUNTIME_AXIS',path);return value.value;}
function exactInputs(question,resolution,availability){
  validateQuestionContract(question);validateUniverseResolution(resolution);validateAvailabilitySnapshot(availability);
  invariant(resolution.question_contract_ref===question.question_contract_hash,'QUESTION_RESOLUTION_MISMATCH','$.universe_resolution_ref');invariant(availability.question_contract_ref===question.question_contract_hash,'QUESTION_AVAILABILITY_MISMATCH','$.availability_snapshot_ref');
  invariant(resolution.subject.resolution_status==='RESOLVED','UNRESOLVED_UNIVERSE_RESOLUTION','$.subject.resolution_status');invariant(resolution.membership.membership_status==='RESOLVED','UNRESOLVED_MEMBERSHIP','$.membership.membership_status');invariant(resolution.coverage.identity==='CERTIFIED'&&resolution.coverage.membership==='CERTIFIED','REQUIRED_AUTHORITY_MISSING','$.coverage');
  invariant(question.subject.expression===resolution.subject.expression,'SUBJECT_EXPRESSION_MISMATCH','$.subject.expression');const universe=axisValue(question.scope.commercial_universe,'$.scope.commercial_universe');invariant(universe===resolution.membership.commercial_universe,'COMMERCIAL_UNIVERSE_MUTATION','$.membership.commercial_universe');
  invariant(question.period?.materialized,'QUESTION_PERIOD_NOT_RUNTIME_READY','$.period');const qp=question.period.materialized,rp=resolution.temporal;invariant(qp.date_from===rp.date_from&&qp.date_to===rp.date_to&&qp.period_status===rp.period_status,'PERIOD_MUTATION','$.temporal');invariant(qp.date_from===availability.requested_period.date_from&&qp.date_to===availability.requested_period.date_to&&qp.period_status===availability.requested_period.period_status,'AVAILABILITY_PERIOD_MISMATCH','$.requested_period');
  const organization=axisValue(question.scope.organization_scope,'$.scope.organization_scope');invariant(resolution.membership.organization_scope.status==='BOUND'&&resolution.membership.organization_scope.value===organization,'ORGANIZATION_SCOPE_MUTATION','$.membership.organization_scope');const grain=axisValue(question.grain,'$.grain');invariant(resolution.grain.requested===grain&&resolution.grain.resolved===grain,'GRAIN_MUTATION','$.grain');
  invariant(resolution.authority.identity_ref?.authority_fingerprint&&resolution.authority.membership_refs?.length,'REQUIRED_AUTHORITY_MISSING','$.authority');return {universe,organization,grain};
}
function bindings(question,resolution,values,measure){return {subject:{entity_type:resolution.subject.entity_type,canonical_id:resolution.subject.canonical_id,canonical_label:resolution.subject.canonical_label,resolution_status:'RESOLVED',authority_ref:resolution.authority.identity_ref.authority_fingerprint},measure,commercial_universe:values.universe,organization_scope:values.organization,period:{...clone(question.period.materialized),quantity:question.period.semantic.quantity,unit:question.period.semantic.unit,alignment:question.period.semantic.alignment},grain:values.grain};}
function id(prefix,fingerprint){return `${prefix}_${fingerprint.slice(-16)}`;}

export function compileInitialGoals({questionContract:question,universeResolution:resolution,availabilitySnapshot:availability}){
  const values=exactInputs(question,resolution,availability),breadth=question.semantic_intent.breadth;
  if(breadth==='FOCUSED'){
    const mapping=FOCUSED_PROPOSITIONS.find(item=>item.operation===question.semantic_intent.operation&&question.semantic_intent.expressed_concepts.length===1&&question.semantic_intent.expressed_concepts[0]===item.concept);invariant(mapping,'UNSUPPORTED_FOCUSED_PROPOSITION','$.semantic_intent');
    const draft={contract_version:'goal_instance.v1',goal_id:'pending',question_contract_ref:question.question_contract_hash,universe_resolution_ref:resolution.resolution_fingerprint,goal_type:mapping.goal_type,evidence_class:'REQUIRED',origin:'USER_EXPRESSED',status:'PENDING',bindings:bindings(question,resolution,values,mapping.measure),comparison:question.comparison.relation,explicit_constraints:clone(question.explicit_constraints)};const semantic=createGoalInstance(draft);draft.goal_id=id('goal',semantic.goal_fingerprint);return {goals:[createGoalInstance(draft)],candidates:[]};
  }
  invariant(breadth==='BROAD'&&question.semantic_intent.operation==='ASSESS','UNSUPPORTED_BROAD_PROPOSITION','$.semantic_intent');invariant(question.deferred_choice_axes.includes('EVIDENCE_PROPOSITION'),'BROAD_SELECTION_AXIS_REQUIRED','$.deferred_choice_axes');
  const candidates=BROAD_PROPOSITIONS.map((item)=>{const measure=item.goal_type==='TEMPORAL_TRAJECTORY'&&values.universe==='RVM_MARKET'?'MARKET_SHARE':item.measure;const draft={contract_version:'initial_goal_candidate.v1',candidate_id:'pending',goal_type:item.goal_type,semantic_label:item.semantic_label,description:item.description,bindings:bindings(question,resolution,values,measure),evidence_class_if_selected:'REQUIRED',origin:'DEFERRED_SEMANTIC_SELECTION',expected_claim_types:item.claims,limitations:[]};const semantic=createInitialGoalCandidate(draft);draft.candidate_id=id('candidate',semantic.candidate_fingerprint);return createInitialGoalCandidate(draft);});return {goals:[],candidates};
}

export function activateCandidate(candidate,{questionContractRef,universeResolutionRef}){
  const draft={contract_version:'goal_instance.v1',goal_id:'pending',question_contract_ref:questionContractRef,universe_resolution_ref:universeResolutionRef,goal_type:candidate.goal_type,evidence_class:'REQUIRED',origin:'USER_SELECTED',status:'PENDING',bindings:clone(candidate.bindings),comparison:'NONE',explicit_constraints:[]};const semantic=createGoalInstance(draft);draft.goal_id=id('goal',semantic.goal_fingerprint);return createGoalInstance(draft);
}

export function runtimeBindingsEqual(left,right){return sameCanonical(left,right);}
