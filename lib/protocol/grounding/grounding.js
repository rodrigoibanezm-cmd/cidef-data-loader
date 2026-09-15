import { createQuestionContract, validateQuestionContract } from '../contracts.js';
import { clone, deepFreeze, invariant, rejectKeysDeep } from '../primitives.js';
import { issueClarification } from './clarification.js';
import { createConversationContextRef, createQuestionDraft, validateGroundingAnalysis, validateQuestionDraft } from './contracts.js';
import { DRAFT_FORBIDDEN_FIELDS } from './enums.js';
import { TARGET_DEFAULT_POLICY } from './defaultPolicy.js';
import { groundLexicalCandidate, isContextDependentUtterance, validateExternalSemanticCandidate } from './lexical.js';

const unresolved=()=>({status:'UNRESOLVED'}); const omitted=(provenance='LINGUISTICALLY_INFERRED')=>({status:'OMITTED',provenance});
const deferred=(value)=>({status:'DEFERRED_SELECTION',value,provenance:'LINGUISTICALLY_INFERRED'});
const carried=(value)=>({...clone(value),provenance:'CONVERSATION_CARRIED'});

function priorSubject(contract) { return {status:'AUTHORITY_PENDING',expression:contract.subject.expression,type_constraints:clone(contract.subject.type_constraints),reference_kind:contract.subject.reference_kind,provenance:'CONVERSATION_CARRIED'}; }
function priorTemporal(contract) { return contract.period?.semantic ? {status:'BOUND',expression:'carried prior period',semantic_period:clone(contract.period.semantic),materialized_period:clone(contract.period.materialized),provenance:'CONVERSATION_CARRIED'} : null; }
function priorScopeField(value) {
  if(typeof value==='string')return carried({status:'BOUND',value});
  if(value?.status==='BOUND')return carried(value);
  return null;
}
function priorComparison(value) { return value?.relation ? {status:'BOUND',relation:value.relation,reference_expression:value.reference_expression,provenance:'CONVERSATION_CARRIED'} : null; }
function buildContext(prior,protocolId) {
  if(!prior)return null; validateQuestionContract(prior);
  return createConversationContextRef({contract_version:'conversation_context_ref.v1',context_id:`context_${prior.question_contract_hash.slice(-12)}`,prior_question_contract:prior,allowed_fields:['subject','period','scope','comparison','grain','semantic_intent']});
}
function fieldProvenance(draft) {
  const result={}; const record=(path,value)=>{if(value?.provenance)result[path]=value.provenance;};
  record('subject',draft.subject);record('temporal',draft.temporal); for(const [key,value] of Object.entries(draft.scope))record(`scope.${key}`,value); record('comparison',draft.comparison);record('grain',draft.grain);record('semantic_intent.operation',draft.semantic_intent.operation);record('semantic_intent.breadth',draft.semantic_intent.breadth);record('semantic_intent.expressed_concepts',draft.semantic_intent.expressed_concepts); for(const item of draft.explicit_constraints)result[`explicit_constraints.${item.constraint_id}`]=item.provenance;
  if(draft.temporal.status==='BOUND'){result['period.materialized.timezone']='DEFAULT_POLICY';result['period.materialized.anchor_timestamp']='DEFAULT_POLICY';result['period.semantic.alignment']='DEFAULT_POLICY';}
  return result;
}
function mergeCandidate(lexical,external) {
  if(!external)return lexical; validateExternalSemanticCandidate(external); const merged=clone(lexical);
  for(const key of ['subject','temporal','comparison','operation','breadth','concepts','causality'])if(merged[key]==null&&external[key]!=null)merged[key]=clone(external[key]);
  merged.scope={...clone(external.scope??{}),...merged.scope}; merged.explicit_constraints=[...(external.explicit_constraints??[]),...merged.explicit_constraints]; return merged;
}
function inferGrain(subject) {
  if(!['BOUND','AUTHORITY_PENDING'].includes(subject.status))return unresolved(); const type=subject.type_constraints.length===1?subject.type_constraints[0]:null;
  const grain={COMPANY:'TOTAL',BRAND:'BRAND',MODEL:'MODEL',STORE:'STORE',SELLER:'SELLER'}[type]; return grain?{status:'BOUND',value:grain,provenance:'LINGUISTICALLY_INFERRED'}:unresolved();
}
function explicitConstraint(candidate,axis,value) { return candidate.explicit_constraints.some((item)=>item.target_axis===axis&&item.value===value); }
function scopeFields(candidate,breadth) {
  const broad=breadth?.value==='BROAD'; const commercial=candidate.scope?.commercial_universe??(broad?deferred(['COMPANY','OWN_STORES','DEALERS']):candidate.comparison?.relation==='MARKET'?omitted():unresolved());
  const organization=candidate.scope?.organization_scope??(broad?deferred(['OMITTED','CIDEF','ALL']):omitted());
  const market=candidate.scope?.market_universe??(candidate.comparison?.relation==='MARKET'?{status:'BOUND',value:'MARKET',provenance:'USER_EXPLICIT'}:broad&&!explicitConstraint(candidate,'SEMANTIC_CONCEPT','MARKET_POSITION')?deferred(['OMITTED','MARKET']):omitted());
  const geography=candidate.scope?.geography??(candidate.comparison?.relation==='MARKET'?unresolved():broad?deferred(['OMITTED','CHILE','RM']):omitted());
  return {commercial_universe:commercial,organization_scope:organization,market_universe:market,geography};
}
function comparisonField(candidate,breadth,operation) {
  if(candidate.comparison)return candidate.comparison;
  if(breadth?.value==='BROAD')return {status:'DEFERRED_SELECTION',provenance:'LINGUISTICALLY_INFERRED'};
  if(operation?.value==='COMPARE'||operation?.value==='EXPLAIN')return unresolved();
  return {status:'BOUND',relation:'NONE',reference_expression:null,provenance:'LINGUISTICALLY_INFERRED'};
}
function carryMissing(current,context,question) {
  if(!context||!isContextDependentUtterance(question))return current; const prior=context.prior_question_contract;
  if(current.subject.status==='UNRESOLVED')current.subject=priorSubject(prior);
  if(current.temporal.status==='UNRESOLVED'){const value=priorTemporal(prior);if(value)current.temporal=value;}
  for(const key of Object.keys(current.scope))if(current.scope[key].status==='UNRESOLVED'){const value=priorScopeField(prior.scope[key]);if(value)current.scope[key]=value;}
  if(current.comparison.status==='UNRESOLVED'){const value=priorComparison(prior.comparison);if(value)current.comparison=value;}
  if(current.grain.status==='UNRESOLVED'&&typeof prior.grain==='string')current.grain={status:'BOUND',value:prior.grain,provenance:'CONVERSATION_CARRIED'};
  if(current.semantic_intent.operation.status==='UNRESOLVED')current.semantic_intent.operation={status:'BOUND',value:prior.semantic_intent.operation,provenance:'CONVERSATION_CARRIED'};
  if(current.semantic_intent.breadth.status==='UNRESOLVED')current.semantic_intent.breadth={status:'BOUND',value:prior.semantic_intent.breadth,provenance:'CONVERSATION_CARRIED'};
  if(current.semantic_intent.expressed_concepts.status==='UNRESOLVED')current.semantic_intent.expressed_concepts={status:'BOUND',value:clone(prior.semantic_intent.expressed_concepts),provenance:'CONVERSATION_CARRIED'};
  return current;
}
function normalizeBroadDeferred(draft) {
  if(draft.semantic_intent.breadth.value!=='BROAD')return draft;
  if(draft.temporal.status==='UNRESOLVED')draft.temporal={status:'DEFERRED_SELECTION',provenance:'LINGUISTICALLY_INFERRED'};
  for(const key of Object.keys(draft.scope))if(draft.scope[key].status==='UNRESOLVED')draft.scope[key]=deferred(key==='commercial_universe'?['COMPANY','OWN_STORES','DEALERS']:['OMITTED']);
  if(draft.comparison.status==='UNRESOLVED')draft.comparison={status:'DEFERRED_SELECTION',provenance:'LINGUISTICALLY_INFERRED'};
  return draft;
}
function issue(issue_id,issue_kind,field_paths,reason_code,alternatives=[]) { return {issue_id,issue_kind,field_paths,reason_code,material:true,alternatives}; }
function contradictoryConstraints(constraints) {
  const only=new Map(); for(const item of constraints.filter((value)=>value.operator==='ALLOW_ONLY')){const prior=only.get(item.target_axis);if(prior&&JSON.stringify(prior)!==JSON.stringify(item.value))return true;only.set(item.target_axis,item.value);} return constraints.some((forbid)=>forbid.operator==='FORBID'&&constraints.some((requirement)=>requirement.target_axis===forbid.target_axis&&['REQUIRE','ALLOW_ONLY'].includes(requirement.operator)&&JSON.stringify(requirement.value)===JSON.stringify(forbid.value)));
}

export function analyzeGrounding(draft) {
  validateQuestionDraft(draft); const issues=[]; const broad=draft.semantic_intent.breadth.value==='BROAD'; const add=(kind,paths,code,alternatives=[])=>issues.push(issue(`issue_${issues.length+1}`,kind,paths,code,alternatives));
  if(contradictoryConstraints(draft.explicit_constraints))add('CONTRADICTORY_CONSTRAINTS',['explicit_constraints'],'CONTRADICTORY_EXPLICIT_BINDINGS');
  if(!['BOUND','AUTHORITY_PENDING'].includes(draft.subject.status))add('MISSING_REQUIRED_SEMANTIC',['subject'],'SUBJECT_REQUIRED');
  if(draft.semantic_intent.operation.status!=='BOUND')add('MISSING_REQUIRED_SEMANTIC',['semantic_intent.operation'],'SEMANTIC_OPERATION_REQUIRED');
  if(draft.semantic_intent.expressed_concepts.status!=='BOUND'||!draft.semantic_intent.expressed_concepts.value?.length)add('MISSING_REQUIRED_SEMANTIC',['semantic_intent.expressed_concepts'],'EVIDENCE_PROPOSITION_REQUIRED');
  if(broad&&draft.semantic_intent.operation.value!=='ASSESS')add('MATERIAL_AMBIGUITY',['semantic_intent.operation'],'BROAD_REQUIRES_ASSESS');
  if(!broad){
    if(draft.temporal.status!=='BOUND')add('MISSING_REQUIRED_SEMANTIC',['temporal'],'PERIOD_REQUIRED');
    if(draft.scope.commercial_universe.status!=='BOUND')add('MATERIAL_AMBIGUITY',['scope.commercial_universe'],'COMMERCIAL_UNIVERSE_REQUIRED',['COMPANY','OWN_STORES','DEALERS']);
    if(draft.comparison.status==='UNRESOLVED')add('MATERIAL_AMBIGUITY',['comparison'],'COMPARISON_REFERENCE_REQUIRED',['YOY','PREVIOUS_PERIOD']);
    if(draft.scope.geography.status==='UNRESOLVED')add('MATERIAL_AMBIGUITY',['scope.geography'],'GEOGRAPHY_REQUIRED');
    if(draft.grain.status!=='BOUND')add('MISSING_REQUIRED_SEMANTIC',['grain'],'GRAIN_REQUIRED');
  }
  const analysis=deepFreeze({contract_version:'grounding_analysis.v1',question_draft_hash:draft.draft_hash,material_ambiguity:issues.length>0,requires_clarification:issues.length>0,issues}); validateGroundingAnalysis(analysis); return analysis;
}

export function createGroundedQuestionDraft(question,{protocol_id='protocol_grounding_fixture',semantic_candidate=null,prior_question_contract=null,now='2026-09-14T12:00:00.000Z',timezone='America/Santiago'}={}) {
  const context=buildContext(prior_question_contract,protocol_id); const candidate=mergeCandidate(groundLexicalCandidate(question,{now,timezone}),semantic_candidate);
  const breadth=candidate.breadth??unresolved(); const operation=candidate.operation??unresolved(); const concepts=candidate.concepts??unresolved();
  let draft={
    contract_version:'question_draft.v1',protocol_id,original_question:question,source_utterances:[question],conversation_context_ref:context??{status:'OMITTED'},
    subject:candidate.subject??unresolved(),temporal:candidate.temporal??(breadth.value==='BROAD'?{status:'DEFERRED_SELECTION',provenance:'LINGUISTICALLY_INFERRED'}:unresolved()),
    scope:scopeFields(candidate,breadth),comparison:comparisonField(candidate,breadth,operation),grain:inferGrain(candidate.subject??unresolved()),
    semantic_intent:{operation,breadth,expressed_concepts:concepts,explicit_conjunction:candidate.explicit_conjunction===true,causality:candidate.causality??'NOT_REQUESTED'},
    explicit_constraints:clone(candidate.explicit_constraints??[]),grounding_issues:[],deferred_choice_axes:breadth.value==='BROAD'?['EVIDENCE_PROPOSITION','PERIOD','COMPARISON','SCOPE']:[],field_provenance:{},applied_policy_refs:['semantic_grounding.v1',...(candidate.temporal?[TARGET_DEFAULT_POLICY.policy_id,'calendar_grounding.v1']:[])],resolved_ambiguity_refs:[],
  };
  draft=normalizeBroadDeferred(carryMissing(draft,context,question)); draft.field_provenance=fieldProvenance(draft); let frozen=createQuestionDraft(draft); const analysis=analyzeGrounding(frozen); if(analysis.issues.length){const withIssues=clone(frozen);delete withIssues.draft_hash;withIssues.grounding_issues=clone(analysis.issues);frozen=createQuestionDraft(withIssues);} rejectKeysDeep(frozen,DRAFT_FORBIDDEN_FIELDS,'$'); return frozen;
}

function qcAxis(field) {
  if(field.status==='BOUND'||field.status==='AUTHORITY_PENDING')return {status:'BOUND',value:field.value};
  if(field.status==='DEFERRED_SELECTION')return {status:'DEFERRED_SELECTION'};
  return {status:'OMITTED'};
}
function toQuestionContract(draft) {
  const period=draft.temporal.status==='BOUND'?{semantic:clone(draft.temporal.semantic_period),materialized:clone(draft.temporal.materialized_period)}:{status:draft.temporal.status};
  const comparison=draft.comparison.status==='BOUND'?{relation:draft.comparison.relation,reference_expression:draft.comparison.reference_expression}:{status:draft.comparison.status};
  return createQuestionContract({
    contract_version:'question_contract.v1',question_id:`question_${draft.draft_hash.slice(-16)}`,version:1,original_question:draft.original_question,
    subject:{expression:draft.subject.expression,type_constraints:clone(draft.subject.type_constraints),reference_kind:draft.subject.reference_kind,authority_resolution_required:true},
    period,scope:{commercial_universe:draft.scope.commercial_universe.status==='BOUND'?draft.scope.commercial_universe.value:qcAxis(draft.scope.commercial_universe),organization_scope:qcAxis(draft.scope.organization_scope),market_universe:qcAxis(draft.scope.market_universe),geography:qcAxis(draft.scope.geography)},
    comparison,grain:draft.grain.status==='BOUND'?draft.grain.value:qcAxis(draft.grain),semantic_intent:{operation:draft.semantic_intent.operation.value,breadth:draft.semantic_intent.breadth.value,expressed_concepts:clone(draft.semantic_intent.expressed_concepts.value),explicit_conjunction:draft.semantic_intent.explicit_conjunction,causality:draft.semantic_intent.causality},
    explicit_constraints:clone(draft.explicit_constraints),deferred_choice_axes:clone(draft.deferred_choice_axes),resolved_ambiguity_refs:clone(draft.resolved_ambiguity_refs),field_provenance:clone(draft.field_provenance),applied_policy_refs:clone(draft.applied_policy_refs),
  });
}

export function finalizeQuestionContract(draft,{clarification_id='clarification_fixture_001',issued_state_version=1,now='2026-09-14T12:00:00.000Z'}={}) {
  validateQuestionDraft(draft); const analysis=analyzeGrounding(draft);
  if(analysis.requires_clarification)return deepFreeze({status:'NEEDS_CLARIFICATION',grounding_analysis:analysis,clarification_request:issueClarification({clarification_id,issued_state_version,draft,issue:analysis.issues[0],now})});
  invariant(!draft.grounding_issues.some((item)=>item.material),'MATERIAL_UNRESOLVED_ISSUE','$.grounding_issues'); const question_contract=toQuestionContract(draft); validateQuestionContract(question_contract); return deepFreeze({status:'FINALIZED',grounding_analysis:analysis,question_contract});
}

export function groundQuestion(question,options={}) { const question_draft=createGroundedQuestionDraft(question,options); return deepFreeze({question_draft,...finalizeQuestionContract(question_draft,options)}); }
