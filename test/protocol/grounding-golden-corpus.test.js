import test from 'node:test';
import assert from 'node:assert/strict';
import { groundQuestion } from '../../lib/protocol/grounding/grounding.js';
import { GROUNDING_GOLDEN_CORPUS, FROZEN_GROUNDING_CLOCK } from '../../lib/protocol/grounding/fixtures/goldenCorpus.js';
import { validateQuestionContract } from '../../lib/protocol/contracts.js';

const byId=Object.fromEntries(GROUNDING_GOLDEN_CORPUS.map((item)=>[item.id,item.question]));
const ground=(id,options={})=>groundQuestion(byId[id],{now:FROZEN_GROUNDING_CLOCK,...options});
function finalizedQuestion(question) { const result=groundQuestion(question,{now:FROZEN_GROUNDING_CLOCK}); assert.equal(result.status,'FINALIZED',question); return result.question_contract; }

test('G01 focused observed result preserves subject and explicit August period without physical routing',()=>{
  const result=ground('G01'),draft=result.question_draft;
  assert.equal(draft.semantic_intent.operation.value,'OBSERVE'); assert.equal(draft.semantic_intent.breadth.value,'FOCUSED'); assert.deepEqual(draft.semantic_intent.expressed_concepts.value,['RESULT']); assert.equal(draft.subject.expression,'Foton'); assert.deepEqual([draft.temporal.materialized_period.date_from,draft.temporal.materialized_period.date_to],['2026-08-01','2026-08-31']); assert.equal(result.status,'NEEDS_CLARIFICATION'); assert.equal(result.clarification_request.reason_code,'COMMERCIAL_UNIVERSE_REQUIRED'); assert.equal(JSON.stringify(draft).includes('capability'),false);
});

test('G02 broad assessment finalizes with deferred selection and no fixed bundle',()=>{
  const result=ground('G02'); assert.equal(result.status,'FINALIZED'); assert.equal(result.question_contract.semantic_intent.operation,'ASSESS'); assert.equal(result.question_contract.semantic_intent.breadth,'BROAD'); assert.ok(result.question_contract.deferred_choice_axes.includes('EVIDENCE_PROPOSITION')); const text=JSON.stringify(result); for(const token of ['goal_instances','question_family','fixed_bundle','decision_plan'])assert.equal(text.includes(token),false,token); validateQuestionContract(result.question_contract);
});

test('G03 market-relative semantics do not imply share growth',()=>{
  const draft=ground('G03').question_draft; assert.equal(draft.semantic_intent.operation.value,'COMPARE'); assert.deepEqual(draft.semantic_intent.expressed_concepts.value,['RELATIVE_REFERENCE','MARKET_POSITION']); assert.equal(draft.comparison.relation,'MARKET'); assert.equal(draft.semantic_intent.expressed_concepts.value.includes('TEMPORAL_BEHAVIOR'),false);
});

test('G04 current-month broad CIDEF question does not default OWN_STORES',()=>{
  const result=ground('G04'); assert.equal(result.status,'FINALIZED'); assert.deepEqual(result.question_contract.period.semantic,{anchor:'CURRENT',quantity:1,unit:'MONTH',closure:'CURRENT',alignment:'CALENDAR'}); assert.notEqual(result.question_contract.scope.commercial_universe,'OWN_STORES'); assert.deepEqual(result.question_contract.scope.commercial_universe,{status:'DEFERRED_SELECTION'});
});

test('G05 risk is user-expressed and not inferred from an observed result',()=>{
  const draft=ground('G05').question_draft; assert.deepEqual(draft.semantic_intent.expressed_concepts.value,['RISK']); assert.equal(draft.semantic_intent.expressed_concepts.provenance,'LINGUISTICALLY_INFERRED'); assert.equal(draft.semantic_intent.expressed_concepts.value.includes('RESULT'),false);
});

test('G06 explanation forbids causal authorization and requests missing comparison or period',()=>{
  const result=ground('G06'),draft=result.question_draft; assert.equal(draft.semantic_intent.operation.value,'EXPLAIN'); assert.equal(draft.semantic_intent.causality,'NOT_AUTHORIZED'); assert.ok(draft.explicit_constraints.some((item)=>item.value==='CAUSAL_CLAIM'&&item.operator==='FORBID')); assert.equal(result.status,'NEEDS_CLARIFICATION'); assert.ok(draft.grounding_issues.some((item)=>['PERIOD_REQUIRED','COMPARISON_REFERENCE_REQUIRED'].includes(item.reason_code)));
});

test('G07 anaphoric comparison requires finalized context and sets YOY explicitly',()=>{
  const prior=finalizedQuestion('¿Cómo va Foton sólo en tiendas propias en agosto de 2026?'); const result=ground('G07',{prior_question_contract:prior}); assert.equal(result.status,'FINALIZED'); assert.equal(result.question_draft.subject.expression,'Foton'); assert.equal(result.question_draft.subject.provenance,'CONVERSATION_CARRIED'); assert.equal(result.question_contract.comparison.relation,'YOY'); assert.equal(result.question_draft.comparison.provenance,'USER_EXPLICIT');
});

test('G08 explicit current subject replaces prior subject while operation is carried',()=>{
  const prior=ground('G02').question_contract; const result=ground('G08',{prior_question_contract:prior}); assert.equal(result.status,'FINALIZED'); assert.equal(result.question_contract.subject.expression,'Plaza Norte'); assert.equal(result.question_draft.subject.provenance,'USER_EXPLICIT'); assert.equal(result.question_draft.semantic_intent.operation.provenance,'CONVERSATION_CARRIED');
});

test('G09 and G10 preserve distinct calendar grammars',()=>{
  const quarter=ground('G09').question_draft.temporal.semantic_period; const months=ground('G10').question_draft.temporal.semantic_period; assert.deepEqual(quarter,{anchor:'LAST',quantity:1,unit:'QUARTER',closure:'CLOSED',alignment:'CALENDAR'}); assert.deepEqual(months,{anchor:'LAST',quantity:3,unit:'MONTH',closure:'CLOSED',alignment:'CALENDAR'}); assert.notDeepEqual(quarter,months);
});

test('G11, G12 and G13 preserve explicit constraints',()=>{
  const own=ground('G11').question_draft.explicit_constraints; assert.ok(own.some((item)=>item.target_axis==='COMMERCIAL_UNIVERSE'&&item.operator==='ALLOW_ONLY'&&item.value==='OWN_STORES'));
  const market=ground('G12').question_draft.explicit_constraints; assert.ok(market.some((item)=>item.operator==='EXCLUDE'&&item.value==='MARKET_POSITION'));
  const projection=ground('G13').question_draft.explicit_constraints; assert.ok(projection.some((item)=>item.operator==='FORBID'&&item.value==='PROJECTED_RESULT'));
});

test('G14 comparison against expectation remains a semantic proposition',()=>{
  const draft=ground('G14').question_draft; assert.equal(draft.semantic_intent.operation.value,'COMPARE'); assert.deepEqual(draft.semantic_intent.expressed_concepts.value,['EXPECTATION']); assert.equal(draft.comparison.relation,'EXPECTED');
});

test('G15 broad question requires subject without context',()=>{
  const result=ground('G15'); assert.equal(result.question_draft.semantic_intent.breadth.value,'BROAD'); assert.equal(result.status,'NEEDS_CLARIFICATION'); assert.equal(result.clarification_request.reason_code,'SUBJECT_REQUIRED');
});

test('G16 problem wording remains broad SIGNAL and does not equal adverse evidence',()=>{
  const draft=ground('G16').question_draft; assert.equal(draft.semantic_intent.breadth.value,'BROAD'); assert.deepEqual(draft.semantic_intent.expressed_concepts.value,['SIGNAL']); assert.equal(draft.semantic_intent.expressed_concepts.value.includes('RISK'),false);
});

test('G17 produces bounded narrowing, never a free planner',()=>{
  const result=ground('G17'); assert.equal(result.question_draft.semantic_intent.breadth.value,'BROAD'); assert.equal(result.status,'NEEDS_CLARIFICATION'); const text=JSON.stringify(result); assert.equal(text.includes('planner'),false); assert.equal(text.includes('capability'),false);
});

test('G18 explicit OWN_STORES survives without COMPANY substitution',()=>{
  const result=ground('G18'); assert.equal(result.status,'FINALIZED'); assert.equal(result.question_contract.scope.commercial_universe,'OWN_STORES'); assert.ok(result.question_contract.explicit_constraints.some((item)=>item.value==='OWN_STORES'));
});

test('G19 exclusions survive finalized QuestionContract unchanged',()=>{
  const result=ground('G19'); assert.equal(result.status,'FINALIZED'); assert.deepEqual(result.question_contract.explicit_constraints,result.question_draft.explicit_constraints); assert.ok(result.question_contract.explicit_constraints.some((item)=>item.value==='MARKET_POSITION')); assert.ok(result.question_contract.explicit_constraints.some((item)=>item.value==='PROJECTED_RESULT'));
});

test('G20 carries prior subject and replaces deferred period with explicit August',()=>{
  const prior=ground('G02').question_contract; const result=ground('G20',{prior_question_contract:prior}); assert.equal(result.status,'FINALIZED'); assert.equal(result.question_draft.subject.expression,'Foton'); assert.equal(result.question_draft.subject.provenance,'CONVERSATION_CARRIED'); assert.equal(result.question_draft.temporal.provenance,'USER_EXPLICIT'); assert.deepEqual([result.question_contract.period.materialized.date_from,result.question_contract.period.materialized.date_to],['2026-08-01','2026-08-31']);
});

test('all twenty golden corpus utterances execute without physical or authority access',()=>{
  const contextual=new Set(['G07','G08','G20']); for(const item of GROUNDING_GOLDEN_CORPUS){if(contextual.has(item.id))continue; const result=ground(item.id); assert.ok(['FINALIZED','NEEDS_CLARIFICATION'].includes(result.status),item.id); const text=JSON.stringify(result.question_draft); for(const token of ['canonical_id','capability_id','motor','question_family'])assert.equal(text.includes(token),false,`${item.id}:${token}`);}
});
