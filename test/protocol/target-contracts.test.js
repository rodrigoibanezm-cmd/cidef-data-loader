import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAction, createEvidenceRecord, createQuestionContract, createSynthesisPacket,
  validateAction, validateApplicabilityDecision, validateCapabilityContract, validateEvidenceRecord,
  validateExecutionAuthorization, validateGoalInstance, validateQuestionContract, validateSufficiencyEvaluation,
  validateSynthesisPacket, validateUniverseResolution,
} from '../../lib/protocol/contracts.js';
import { parseVentasLongitudinalInput } from '../../lib/longitudinal/ventas.js';
import {
  buildObservedResultFixture, negativeFixtureDrafts, SYNTHETIC_OBSERVED_VIN_VALUE,
} from '../../lib/protocol/fixtures/observedResult.js';
import { clone } from '../../lib/protocol/primitives.js';

test('complete OBSERVED_RESULT target contract chain validates', () => {
  const f = buildObservedResultFixture();
  assert.equal(validateQuestionContract(f.question), true);
  assert.equal(validateUniverseResolution(f.resolution), true);
  assert.equal(validateGoalInstance(f.goal), true);
  assert.equal(validateCapabilityContract(f.capability), true);
  assert.equal(validateApplicabilityDecision(f.decision), true);
  assert.equal(validateAction(f.action), true);
  assert.equal(validateExecutionAuthorization(f.authorization), true);
  assert.equal(validateEvidenceRecord(f.evidence), true);
  assert.equal(validateSufficiencyEvaluation(f.sufficiency), true);
  assert.equal(validateSynthesisPacket(f.synthesis), true);
  assert.equal(f.decision.status, 'APPLICABLE');
  assert.equal(f.sufficiency.goal_status, 'SATISFIED');
  assert.equal(f.synthesis.outcome, 'COMPLETE');
});

test('QuestionContract rejects canonical identity and contains no physical identity', () => {
  const draft = clone(buildObservedResultFixture().question);
  delete draft.question_contract_hash;
  draft.subject.canonical_id = 'forbidden';
  assert.throws(() => createQuestionContract(draft), /UNKNOWN_FIELD|FORBIDDEN_FIELD/);
});

test('QuestionContract permits null only for an explicit NONE comparison reference', () => {
  const draft = clone(buildObservedResultFixture().question); delete draft.question_contract_hash;
  draft.explicit_constraints = [null];
  assert.throws(() => createQuestionContract(draft), /AMBIGUOUS_NULL_FORBIDDEN/);
});

test('UniverseResolution owns certified canonical identity and authority', () => {
  const { resolution } = buildObservedResultFixture();
  assert.equal(resolution.subject.canonical_id, 'brand_fixture_foton');
  assert.equal(resolution.coverage.identity, 'CERTIFIED');
  assert.match(resolution.authority.identity_ref, /fixture/);
});

test('GoalInstance is semantic and has no physical execution fields', () => {
  const { goal } = buildObservedResultFixture();
  const text = JSON.stringify(goal);
  for (const token of ['capability_id','motor','physical_request','sql','table']) assert.equal(text.includes(token), false, token);
});

test('LONGITUDINAL/VENTAS capability contract matches the audited physical parser subset', () => {
  const f = buildObservedResultFixture();
  const parsed = parseVentasLongitudinalInput(f.authorization.physical_request.input);
  assert.equal(f.capability.capability_contract_id, 'LONGITUDINAL/VENTAS');
  assert.deepEqual(f.capability.supports.commercial_universes, ['COMPANY']);
  assert.equal(parsed.metric, 'VIN_SALES'); assert.equal(parsed.grain, 'BRAND');
  assert.equal(parsed.commercialUniverse, 'COMPANY'); assert.equal(parsed.timeGrain, 'MONTH');
  assert.deepEqual(parsed.filters.brand_id, ['brand_fixture_foton']);
});

test('Action is semantic only and leaking physical capability is rejected', () => {
  const { action } = buildObservedResultFixture();
  assert.equal(action.semantic_label, 'OBSERVE_SALES_RESULT');
  const { leakingAction } = negativeFixtureDrafts();
  assert.throws(() => createAction(leakingAction), /UNKNOWN_FIELD|FORBIDDEN_FIELD/);
});

test('ExecutionAuthorization contains internal physical selection and exact binding', () => {
  const { authorization, goal } = buildObservedResultFixture();
  assert.equal(authorization.status, 'AUTHORIZED');
  assert.equal(authorization.physical_request.action, 'ventas_longitudinal_context_v01');
  assert.deepEqual(authorization.effective_binding, goal.bindings);
});

test('EvidenceRecord is typed, exact-bound, provenance-required and synthetic', () => {
  const { evidence, goal } = buildObservedResultFixture();
  assert.deepEqual(evidence.semantic_binding, goal.bindings);
  assert.equal(evidence.claims[0].claim_type, 'OBSERVED_VALUE');
  assert.equal(evidence.claims[0].value, SYNTHETIC_OBSERVED_VIN_VALUE);
  assert.equal(evidence.provenance.synthetic, true);
  const { missingProvenanceEvidence } = negativeFixtureDrafts();
  assert.throws(() => createEvidenceRecord(missingProvenanceEvidence), /UNKNOWN_FIELD|MISSING_PROVENANCE/);
});

test('EvidenceRecord rejects an unregistered claim type', () => {
  const draft = clone(buildObservedResultFixture().evidence); delete draft.evidence_fingerprint;
  draft.claims[0].claim_type = 'TEMPORAL_CHANGE';
  assert.throws(() => createEvidenceRecord(draft), /INVALID_ENUM/);
});

test('EvidenceRecord rejects a claim that diverges from its semantic binding', () => {
  const { wrongBindingEvidence } = negativeFixtureDrafts();
  assert.throws(() => createEvidenceRecord(wrongBindingEvidence), /CLAIM_BINDING_MISMATCH/);
});

test('SynthesisPacket exposes only admitted claims and no physical internals', () => {
  const { synthesis } = buildObservedResultFixture();
  assert.equal(synthesis.authorized_claims.length, 1);
  assert.equal(synthesis.authorized_claims[0].claim_type, 'OBSERVED_VALUE');
  const text = JSON.stringify(synthesis);
  for (const token of ['LONGITUDINAL/VENTAS','ventas_longitudinal_context_v01','physical_request','capability_contract','raw_payload','sql']) assert.equal(text.includes(token), false, token);
});

test('SynthesisPacket rejects physical internals', () => {
  const draft = clone(buildObservedResultFixture().synthesis); delete draft.packet_hash;
  draft.physical_request = { action: 'forbidden' };
  assert.throws(() => createSynthesisPacket(draft), /UNKNOWN_FIELD|FORBIDDEN_FIELD/);
});

test('final target contracts are recursively immutable', () => {
  const f = buildObservedResultFixture();
  for (const value of [f.question,f.resolution,f.capability,f.decision,f.action,f.authorization,f.evidence,f.synthesis]) {
    assert.equal(Object.isFrozen(value), true);
    assert.equal(Object.isFrozen(value[Object.keys(value).find((key) => value[key] && typeof value[key] === 'object')]), true);
  }
  assert.throws(() => { f.goal.bindings.measure = 'OTHER'; }, TypeError);
});
