import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCapabilityContract, createEvidenceRecord, createGoalInstance, createQuestionContract, createUniverseResolution,
} from '../../lib/protocol/contracts.js';
import {
  authorizeExecution, buildSynthesisPacket, evaluateApplicability, evaluateObservedResultSufficiency,
} from '../../lib/protocol/kernel.js';
import { canonicalSerialize, clone, fingerprint } from '../../lib/protocol/primitives.js';
import {
  buildObservedResultFixture, negativeFixtureDrafts,
} from '../../lib/protocol/fixtures/observedResult.js';

function decisionFor(goal, resolution, fixture, id) {
  return evaluateApplicability({ decision_id: id, goal, capability: fixture.capability, resolution, availability: fixture.availability });
}

test('fingerprints are deterministic and ignore object key ordering', () => {
  assert.equal(fingerprint({ b: 2, a: { d: 4, c: 3 } }), fingerprint({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(canonicalSerialize({ z: 1, a: 2 }), canonicalSerialize({ a: 2, z: 1 }));
  const first = buildObservedResultFixture(); const second = buildObservedResultFixture();
  assert.equal(first.question.question_contract_hash, second.question.question_contract_hash);
  assert.equal(first.authorization.execution_fingerprint, second.authorization.execution_fingerprint);
});

test('semantic mutation changes QuestionContract fingerprint while opaque id does not', () => {
  const base = buildObservedResultFixture().question;
  const idChange = clone(base); delete idChange.question_contract_hash; idChange.question_id = 'another_opaque_id';
  const semanticChange = clone(base); delete semanticChange.question_contract_hash; semanticChange.grain = 'MODEL';
  assert.equal(createQuestionContract(idChange).question_contract_hash, base.question_contract_hash);
  assert.notEqual(createQuestionContract(semanticChange).question_contract_hash, base.question_contract_hash);
});

test('scope mutation prevents applicability: COMPANY cannot use OWN_STORES binding', () => {
  const f = buildObservedResultFixture(); const { wrongUniverseGoal } = negativeFixtureDrafts();
  const goal = createGoalInstance(wrongUniverseGoal); const decision = decisionFor(goal, f.resolution, f, 'decision_wrong_universe');
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.ok(decision.reason_codes.includes('UNIVERSE_MISMATCH'));
});

test('unsupported entity, period status, grain and measure fail applicability', () => {
  const f = buildObservedResultFixture(); const negatives = negativeFixtureDrafts();
  const cases = [
    [negatives.wrongEntityGoal, 'UNSUPPORTED_ENTITY_TYPE'],
    [negatives.wrongPeriodGoal, 'UNSUPPORTED_PERIOD_STATUS'],
    [negatives.wrongGrainGoal, 'UNSUPPORTED_GRAIN'],
  ];
  const measureDraft = clone(f.goal); delete measureDraft.goal_fingerprint; measureDraft.goal_id = 'goal_wrong_measure'; measureDraft.bindings.measure = 'REVENUE';
  cases.push([measureDraft, 'UNSUPPORTED_MEASURE']);
  for (const [draft, reason] of cases) {
    const goal = createGoalInstance(draft); const decision = decisionFor(goal, f.resolution, f, `decision_${reason}`);
    assert.equal(decision.status, 'NOT_APPLICABLE'); assert.ok(decision.reason_codes.includes(reason), reason);
  }
});

test('unresolved identity authority fails applicability', () => {
  const f = buildObservedResultFixture(); const { unresolvedResolution } = negativeFixtureDrafts();
  const resolution = createUniverseResolution(unresolvedResolution);
  const goalDraft = clone(f.goal); delete goalDraft.goal_fingerprint; goalDraft.universe_resolution_ref = resolution.resolution_fingerprint;
  const goal = createGoalInstance(goalDraft); const decision = decisionFor(goal, resolution, f, 'decision_unresolved');
  assert.equal(decision.status, 'NOT_APPLICABLE'); assert.ok(decision.reason_codes.includes('UNRESOLVED_IDENTITY_AUTHORITY'));
});

test('empty permitted-claim intersection fails applicability', () => {
  const f = buildObservedResultFixture();
  const capability = clone(f.capability); delete capability.capability_fingerprint; capability.permitted_claim_types = ['OBSERVED_VALUE'];
  capability.permitted_claim_types = [];
  const decision = evaluateApplicability({ decision_id: 'empty', goal: f.goal, capability: createCapabilityContract(capability), resolution: f.resolution, availability: f.availability });
  assert.equal(decision.status, 'NOT_APPLICABLE'); assert.ok(decision.reason_codes.includes('EMPTY_CLAIM_INTERSECTION'));
});

test('universe and period mutations prevent execution authorization', () => {
  const f = buildObservedResultFixture(); const negatives = negativeFixtureDrafts();
  for (const draft of [negatives.wrongUniverseGoal, negatives.wrongPeriodGoal]) {
    const goal = createGoalInstance(draft); const decision = decisionFor(goal, f.resolution, f, `decision_${goal.goal_id}`);
    assert.throws(() => authorizeExecution({ execution_id: `execution_${goal.goal_id}`, action: f.action, goal, capability: f.capability, decision, resolution: f.resolution, availability: f.availability }), /ACTION_GOAL_MISMATCH|APPLICATION_NOT_AUTHORIZED/);
  }
});

test('authorized claims are a subset of CapabilityContract permitted claims', () => {
  const f = buildObservedResultFixture();
  assert.ok(f.authorization.authorized_claim_types.every((claim) => f.capability.permitted_claim_types.includes(claim)));
});

test('execution success without a claim cannot satisfy OBSERVED_RESULT', () => {
  const f = buildObservedResultFixture(); const { successWithoutClaim } = negativeFixtureDrafts();
  const evidence = createEvidenceRecord(successWithoutClaim);
  const evaluation = evaluateObservedResultSufficiency({ evaluation_id: 'eval_no_claim', goal: f.goal, resolution: f.resolution, evidence_records: [evidence] });
  assert.equal(evaluation.goal_status, 'PENDING'); assert.ok(evaluation.reason_codes.includes('OBSERVATION_MISSING'));
});

test('wrong subject, period or universe evidence cannot satisfy the goal', () => {
  const f = buildObservedResultFixture();
  const mutations = [
    (draft) => { draft.semantic_binding.subject.canonical_id = 'other'; draft.claims[0].subject.canonical_id = 'other'; },
    (draft) => { draft.semantic_binding.period.date_from = '2026-07-01'; draft.semantic_binding.period.date_to = '2026-07-31'; draft.claims[0].period.date_from = '2026-07-01'; draft.claims[0].period.date_to = '2026-07-31'; },
    (draft) => { draft.semantic_binding.commercial_universe = 'OWN_STORES'; draft.claims[0].scope.commercial_universe = 'OWN_STORES'; },
  ];
  mutations.forEach((mutate, index) => {
    const draft = clone(f.evidence); delete draft.evidence_fingerprint; draft.evidence_id = `wrong_binding_${index}`; mutate(draft);
    const evidence = createEvidenceRecord(draft);
    const evaluation = evaluateObservedResultSufficiency({ evaluation_id: `eval_wrong_${index}`, goal: f.goal, resolution: f.resolution, evidence_records: [evidence] });
    assert.equal(evaluation.goal_status, 'PENDING'); assert.ok(evaluation.reason_codes.includes('EXACT_BINDING_MISMATCH'));
  });
});

test('missing authority is not sufficient', () => {
  const f = buildObservedResultFixture(); const draft = clone(f.evidence); delete draft.evidence_fingerprint;
  draft.evidence_id = 'missing_authority'; draft.authority.identity_ref = '';
  const evaluation = evaluateObservedResultSufficiency({ evaluation_id: 'eval_missing_authority', goal: f.goal, resolution: f.resolution, evidence_records: [draft] });
  assert.equal(evaluation.goal_status, 'PENDING'); assert.ok(evaluation.reason_codes.includes('INVALID_STRING'));
});

test('valid observed record satisfies exact OBSERVED_RESULT proof without arithmetic', () => {
  const f = buildObservedResultFixture();
  assert.equal(f.sufficiency.goal_status, 'SATISFIED');
  assert.deepEqual(f.sufficiency.authorized_claim_types, ['OBSERVED_VALUE']);
});

test('SynthesisPacket claims are a subset of admitted authorized claims', () => {
  const f = buildObservedResultFixture();
  const packet = buildSynthesisPacket({ question: f.question, goal: f.goal, evaluation: f.sufficiency, evidence_records: [f.evidence] });
  assert.ok(packet.authorized_claims.every((claim) => f.sufficiency.authorized_claim_types.includes(claim.claim_type)));
  assert.equal(packet.authorized_claims[0].value, f.evidence.claims[0].value);
});

test('EvidenceRecord requires provenance and contains no raw motor payload', () => {
  const f = buildObservedResultFixture();
  assert.equal(Object.hasOwn(f.evidence, 'raw_payload'), false);
  assert.equal(Object.hasOwn(f.evidence, 'motor_payload'), false);
  const { missingProvenanceEvidence } = negativeFixtureDrafts();
  assert.throws(() => createEvidenceRecord(missingProvenanceEvidence), /UNKNOWN_FIELD|MISSING_PROVENANCE/);
});
