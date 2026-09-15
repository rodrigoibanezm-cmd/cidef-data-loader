import test from 'node:test';
import assert from 'node:assert/strict';
import { clone } from '../../lib/protocol/primitives.js';
import { createQuestionContract } from '../../lib/protocol/contracts.js';
import {
  createClarificationResponse, createConversationContextRef, createQuestionDraft,
  validateClarificationRequest, validateClarificationResponse, validateQuestionDraft,
} from '../../lib/protocol/grounding/contracts.js';
import { applyClarification, InMemoryClarificationHarness } from '../../lib/protocol/grounding/clarification.js';
import { createGroundedQuestionDraft, finalizeQuestionContract, groundQuestion } from '../../lib/protocol/grounding/grounding.js';
import { FROZEN_GROUNDING_CLOCK } from '../../lib/protocol/grounding/fixtures/goldenCorpus.js';

const options={now:FROZEN_GROUNDING_CLOCK};
const g=(question,extra={})=>groundQuestion(question,{...options,...extra});
function response(request,selected_option_id,overrides={}) { return createClarificationResponse({contract_version:'clarification_response.v1',response_id:'response_fixture',protocol_id:request.protocol_id,clarification_id:request.clarification_id,issued_state_version:request.issued_state_version,request_fingerprint:request.request_fingerprint,selected_option_id,...overrides}); }

test('QuestionDraft validates and excludes canonical or physical identities',()=>{
  const draft=createGroundedQuestionDraft('¿Cómo va Foton?',options); assert.equal(validateQuestionDraft(draft),true);
  for(const field of ['canonical_id','capability_id']){const mutated=clone(draft);delete mutated.draft_hash;mutated.subject[field]='forbidden';assert.throws(()=>createQuestionDraft(mutated),/UNKNOWN_FIELD|FORBIDDEN_FIELD/);}
});

test('focused result cannot silently default COMPANY, OWN_STORES or YOY',()=>{
  const result=g('¿Cuánto vendió Foton en agosto de 2026?'),draft=result.question_draft; assert.equal(result.status,'NEEDS_CLARIFICATION'); assert.equal(draft.scope.commercial_universe.status,'UNRESOLVED'); assert.notEqual(draft.scope.commercial_universe.value,'COMPANY'); assert.notEqual(draft.scope.commercial_universe.value,'OWN_STORES'); assert.equal(draft.comparison.relation,'NONE'); assert.notEqual(draft.comparison.relation,'YOY');
});

test('BROAD draft cannot contain fixed bundles or activated goals',()=>{
  for(const field of ['fixed_bundle','goal_instances']){const mutated=clone(g('¿Cómo va Foton?').question_draft);delete mutated.draft_hash;mutated[field]=[];assert.throws(()=>createQuestionDraft(mutated),/UNKNOWN_FIELD/);}
});

test('focused unresolved core semantics cannot finalize',()=>{
  const result=g('¿Cuánto vendió Foton?'); assert.equal(result.status,'NEEDS_CLARIFICATION'); assert.ok(result.grounding_analysis.issues.some((item)=>item.reason_code==='PERIOD_REQUIRED')); assert.ok(result.grounding_analysis.issues.some((item)=>item.reason_code==='COMMERCIAL_UNIVERSE_REQUIRED'));
});

test('inferred or explicit omission requires provenance',()=>{
  const draft=clone(g('¿Cómo va Foton?').question_draft);delete draft.draft_hash;draft.scope.market_universe={status:'OMITTED'};delete draft.field_provenance['scope.market_universe'];assert.throws(()=>createQuestionDraft(draft),/INVALID_ENUM/);
});

test('contradictory explicit constraints cannot finalize',()=>{
  const draft=clone(g('¿Cómo va Foton sólo en tiendas propias?').question_draft);delete draft.draft_hash;draft.explicit_constraints.push({constraint_id:'contradict_company',target_axis:'COMMERCIAL_UNIVERSE',operator:'ALLOW_ONLY',value:'COMPANY',provenance:'USER_EXPLICIT'});draft.field_provenance['explicit_constraints.contradict_company']='USER_EXPLICIT'; const result=finalizeQuestionContract(createQuestionDraft(draft),options); assert.equal(result.status,'NEEDS_CLARIFICATION'); assert.equal(result.clarification_request.issue_kind,'CONTRADICTORY_CONSTRAINTS');
});

test('ClarificationRequest and ClarificationResponse contracts are closed and XOR selection',()=>{
  const request=g('¿Cuánto vendió Foton en agosto de 2026?').clarification_request; assert.equal(validateClarificationRequest(request),true); const selected=response(request,'universe_company'); assert.equal(validateClarificationResponse(selected),true); assert.throws(()=>createClarificationResponse({...selected,free_text:'otra'}),/CLARIFICATION_RESPONSE_XOR_REQUIRED/); assert.throws(()=>createClarificationResponse({...selected,selected_option_id:undefined,free_text:undefined}),/CLARIFICATION_RESPONSE_XOR_REQUIRED/);
});

test('clarification application updates provenance, hash and finalizes QuestionContract',()=>{
  const initial=g('¿Cuánto vendió Foton en agosto de 2026?'),request=initial.clarification_request; const updated=applyClarification(initial.question_draft,request,response(request,'universe_company'),{current_state_version:1,now:FROZEN_GROUNDING_CLOCK}); assert.notEqual(updated.draft.draft_hash,initial.question_draft.draft_hash); assert.equal(updated.draft.scope.commercial_universe.value,'COMPANY'); assert.equal(updated.draft.scope.commercial_universe.provenance,'USER_CLARIFIED'); assert.equal(updated.draft.field_provenance['scope.commercial_universe'],'USER_CLARIFIED'); const final=finalizeQuestionContract(updated.draft,options); assert.equal(final.status,'FINALIZED'); assert.equal(final.question_contract.scope.commercial_universe,'COMPANY'); assert.ok(final.question_contract.resolved_ambiguity_refs.includes(request.request_fingerprint));
});

test('stale clarification, unknown option and mutated request fingerprint are rejected',()=>{
  const initial=g('¿Cuánto vendió Foton en agosto de 2026?'),request=initial.clarification_request,valid=response(request,'universe_company');
  assert.throws(()=>applyClarification(initial.question_draft,request,valid,{current_state_version:2,now:FROZEN_GROUNDING_CLOCK}),/STALE_CLARIFICATION_RESPONSE/);
  assert.throws(()=>applyClarification(initial.question_draft,request,response(request,'unknown'),{current_state_version:1,now:FROZEN_GROUNDING_CLOCK}),/UNKNOWN_CLARIFICATION_OPTION/);
  const tampered=createClarificationResponse({...valid,request_fingerprint:'sha256:tampered'}); assert.throws(()=>applyClarification(initial.question_draft,request,tampered,{current_state_version:1,now:FROZEN_GROUNDING_CLOCK}),/CLARIFICATION_REFERENCE_MISMATCH/);
});

test('consumed clarification cannot replay',()=>{
  const initial=g('¿Cuánto vendió Foton en agosto de 2026?'),request=initial.clarification_request,answer=response(request,'universe_company'),harness=new InMemoryClarificationHarness(); harness.apply(initial.question_draft,request,answer,{current_state_version:1,now:FROZEN_GROUNDING_CLOCK}); assert.throws(()=>harness.apply(initial.question_draft,request,answer,{current_state_version:1,now:FROZEN_GROUNDING_CLOCK}),/CLARIFICATION_ALREADY_CONSUMED/);
});

test('expired clarification and ungrounded free text are rejected',()=>{
  const initial=g('¿Qué está pasando?'),request=initial.clarification_request; const free=createClarificationResponse({contract_version:'clarification_response.v1',response_id:'free_response',protocol_id:request.protocol_id,clarification_id:request.clarification_id,issued_state_version:request.issued_state_version,request_fingerprint:request.request_fingerprint,free_text:'Foton'});
  assert.throws(()=>applyClarification(initial.question_draft,request,free,{current_state_version:1,now:'2026-09-14T12:16:00.000Z'}),/CLARIFICATION_EXPIRED/);
  assert.throws(()=>applyClarification(initial.question_draft,request,free,{current_state_version:1,now:FROZEN_GROUNDING_CLOCK}),/FREE_TEXT_GROUNDER_REQUIRED/);
  const updated=applyClarification(initial.question_draft,request,free,{current_state_version:1,now:FROZEN_GROUNDING_CLOCK,free_text_grounder:()=>[{path:'subject',value:{status:'AUTHORITY_PENDING',expression:'Foton',type_constraints:['BRAND'],reference_kind:'DIRECT'}}]}); assert.equal(updated.draft.subject.expression,'Foton'); assert.equal(updated.draft.subject.provenance,'USER_CLARIFIED');
});

test('conversation context requires a finalized QuestionContract and rejects opaque values',()=>{
  assert.throws(()=>createGroundedQuestionDraft('Compáralo con el año pasado.',{...options,prior_question_contract:{opaque:'memory'}}),/UNKNOWN_FIELD|INVALID_OBJECT/);
  const prior=g('¿Cómo va Foton?').question_contract; assert.throws(()=>createConversationContextRef({contract_version:'conversation_context_ref.v1',context_id:'ctx',prior_question_contract:prior,allowed_fields:['subject'],opaque_context:{raw:'forbidden'}}),/UNKNOWN_FIELD/);
});

test('current explicit subject overrides carried subject',()=>{
  const prior=g('¿Cómo va Foton?').question_contract,result=g('¿Y Plaza Norte?',{prior_question_contract:prior}); assert.equal(result.question_draft.subject.expression,'Plaza Norte'); assert.equal(result.question_draft.subject.provenance,'USER_EXPLICIT');
});

test('last quarter can never collapse into last three months',()=>{
  const quarter=g('Último trimestre.').question_draft.temporal,months=g('Últimos 3 meses.').question_draft.temporal; assert.notDeepEqual(quarter.semantic_period,months.semantic_period); assert.notDeepEqual(quarter.materialized_period,months.materialized_period);
});

test('QuestionContract finalization rejects persisted MATERIAL_UNRESOLVED issue',()=>{
  const draft=clone(g('¿Cómo va Foton?').question_draft);delete draft.draft_hash;draft.grounding_issues=[{issue_id:'material_fixture',issue_kind:'MATERIAL_AMBIGUITY',field_paths:['comparison'],reason_code:'MATERIAL_UNRESOLVED',material:true,alternatives:[]}]; assert.throws(()=>finalizeQuestionContract(createQuestionDraft(draft),options),/MATERIAL_UNRESOLVED_ISSUE/);
});

test('WP01 QuestionContract remains backward compatible',()=>{
  const original=g('¿Cómo va Foton?').question_contract; assert.doesNotThrow(()=>createQuestionContract(clone(original)));
});

test('explicit comparison-only constraint is preserved',()=>{
  const result=g('Compáralo sólo con agosto pasado.'); assert.equal(result.question_draft.comparison.relation,'PREVIOUS_PERIOD'); assert.ok(result.question_draft.explicit_constraints.some((item)=>item.target_axis==='COMPARISON'&&item.operator==='ALLOW_ONLY'&&item.value==='PREVIOUS_PERIOD'));
});
