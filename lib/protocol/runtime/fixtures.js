import { createAvailabilitySnapshot, createQuestionContract, createUniverseResolution } from '../contracts.js';
import { clone } from '../primitives.js';
import { buildWp04Fixture, WP04_OBSERVED_AT } from '../resolution/fixtures.js';
import { initializeProtocol } from './reducer.js';

export const WP05_CLOCK='2026-09-15T12:00:00.000Z';

function without(value,key){const output=clone(value);delete output[key];return output;}

export async function buildFocusedRuntimeFixture(){const boundary=await buildWp04Fixture();const state=initializeProtocol({questionContract:boundary.question,universeResolution:boundary.resolution,availabilitySnapshot:boundary.availability,clock:WP05_CLOCK,protocol_id:'protocol_wp05_focused'});return {...boundary,state};}

export async function buildBroadRuntimeFixture(){
  const base=await buildWp04Fixture(),questionDraft=without(base.question,'question_contract_hash');questionDraft.question_id='question_wp05_broad';questionDraft.original_question='¿Cómo va Foton?';questionDraft.semantic_intent={operation:'ASSESS',breadth:'BROAD',expressed_concepts:['SIGNAL'],explicit_conjunction:false,causality:'NOT_REQUESTED'};questionDraft.deferred_choice_axes=['EVIDENCE_PROPOSITION'];questionDraft.field_provenance={...questionDraft.field_provenance,'semantic_intent.operation':'LINGUISTICALLY_INFERRED','semantic_intent.breadth':'LINGUISTICALLY_INFERRED','semantic_intent.expressed_concepts':'LINGUISTICALLY_INFERRED'};const question=createQuestionContract(questionDraft);
  const resolutionDraft=without(base.resolution,'resolution_fingerprint');resolutionDraft.resolution_id='resolution_wp05_broad';resolutionDraft.question_contract_ref=question.question_contract_hash;const resolution=createUniverseResolution(resolutionDraft);
  const availabilityDraft=without(base.availability,'snapshot_fingerprint');availabilityDraft.snapshot_id='availability_wp05_broad';availabilityDraft.question_contract_ref=question.question_contract_hash;availabilityDraft.observed_at=WP04_OBSERVED_AT;const availability=createAvailabilitySnapshot(availabilityDraft);
  const state=initializeProtocol({questionContract:question,universeResolution:resolution,availabilitySnapshot:availability,clock:WP05_CLOCK,protocol_id:'protocol_wp05_broad'});return {question,resolution,availability,state};
}
