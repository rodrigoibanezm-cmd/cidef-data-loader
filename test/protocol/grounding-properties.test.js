import test from 'node:test';
import assert from 'node:assert/strict';
import { clone } from '../../lib/protocol/primitives.js';
import { createQuestionDraft } from '../../lib/protocol/grounding/contracts.js';
import { createGroundedQuestionDraft, groundQuestion } from '../../lib/protocol/grounding/grounding.js';
import { FROZEN_GROUNDING_CLOCK } from '../../lib/protocol/grounding/fixtures/goldenCorpus.js';
import { TARGET_DEFAULT_POLICY, validateDefaultPolicy } from '../../lib/protocol/grounding/defaultPolicy.js';

const options={now:FROZEN_GROUNDING_CLOCK};
const draft=(question,extra={})=>createGroundedQuestionDraft(question,{...options,...extra});

test('equivalent presentation yields the same semantic draft fingerprint',()=>{
  assert.equal(draft('¿Cómo va Foton?').draft_hash,draft('como va foton').draft_hash);
});

test('material semantic mutation changes draft hash',()=>{
  const base=draft('¿Cómo va Foton?'),mutated=clone(base);delete mutated.draft_hash;mutated.scope.commercial_universe={status:'BOUND',value:'OWN_STORES',provenance:'USER_EXPLICIT'};mutated.field_provenance['scope.commercial_universe']='USER_EXPLICIT';assert.notEqual(createQuestionDraft(mutated).draft_hash,base.draft_hash);
});

test('explicit constraint overrides absence of default and is never replaced',()=>{
  const result=groundQuestion('¿Cómo va Foton sólo en tiendas propias?',options);assert.equal(result.question_contract.scope.commercial_universe,'OWN_STORES');assert.equal(result.question_draft.scope.commercial_universe.provenance,'USER_EXPLICIT');
});

test('explicit current text overrides carried context while other eligible fields carry',()=>{
  const prior=groundQuestion('¿Cómo va Foton?',options).question_contract;const next=groundQuestion('¿Y Plaza Norte?',{...options,prior_question_contract:prior}).question_draft;assert.equal(next.subject.expression,'Plaza Norte');assert.equal(next.subject.provenance,'USER_EXPLICIT');assert.equal(next.semantic_intent.operation.provenance,'CONVERSATION_CARRIED');
});

test('registered defaults never override explicit temporal semantics',()=>{
  assert.equal(validateDefaultPolicy(TARGET_DEFAULT_POLICY),true);assert.equal(Object.isFrozen(TARGET_DEFAULT_POLICY),true);const grounded=draft('¿Cómo va CIDEF este mes?'),current=grounded.temporal;assert.equal(current.semantic_period.anchor,'CURRENT');assert.equal(current.semantic_period.closure,'CURRENT');assert.equal(current.materialized_period.timezone,'America/Santiago');assert.equal(current.materialized_period.anchor_timestamp,FROZEN_GROUNDING_CLOCK);assert.ok(grounded.applied_policy_refs.includes(TARGET_DEFAULT_POLICY.policy_id));assert.equal(draft('¿Cómo va Foton?').applied_policy_refs.includes(TARGET_DEFAULT_POLICY.policy_id),false);
});

test('no canonical or capability identity can originate from grounding corpus',()=>{
  const questions=['¿Cómo va Foton?','¿Cuánto vendió Foton en agosto de 2026?','¿Cómo va CIDEF este mes?','¿Cómo va Foton frente al mercado?'];for(const question of questions){const text=JSON.stringify(draft(question));for(const token of ['canonical_id','capability_id','capability_name','motor'])assert.equal(text.includes(token),false,`${question}:${token}`);}
});

test('BROAD semantics defer axes and never activate multiple propositions',()=>{
  const value=draft('¿Cómo va Foton?');assert.equal(value.semantic_intent.breadth.value,'BROAD');assert.deepEqual(value.semantic_intent.expressed_concepts.value,['SIGNAL']);assert.ok(value.deferred_choice_axes.length>0);for(const key of ['goals','goal_instances','requirements','bundle'])assert.equal(Object.hasOwn(value,key),false,key);
});

test('temporal materialization is deterministic under frozen clock and timezone',()=>{
  for(const question of ['este mes','mes pasado','último trimestre','últimos 3 meses','trimestre actual','YTD'])assert.deepEqual(draft(question).temporal,draft(question).temporal,question);
});

test('explicit month in follow-up replaces context period while subject carries',()=>{
  const prior=groundQuestion('¿Cómo va Foton?',options).question_contract,next=groundQuestion('¿Y en agosto?',{...options,prior_question_contract:prior}).question_draft;assert.equal(next.subject.provenance,'CONVERSATION_CARRIED');assert.equal(next.temporal.provenance,'USER_EXPLICIT');assert.deepEqual([next.temporal.materialized_period.date_from,next.temporal.materialized_period.date_to],['2026-08-01','2026-08-31']);
});

test('same-period previous-year phrase binds YOY but no silent YOY exists otherwise',()=>{
  const explicit=draft('Compáralo con el mismo período del año anterior.');assert.equal(explicit.comparison.relation,'YOY');const plain=draft('¿Cuánto vendió Foton en agosto de 2026?');assert.equal(plain.comparison.relation,'NONE');
});
