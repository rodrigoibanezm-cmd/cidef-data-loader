import {
  clone, deepFreeze, finalizeWithHash, fingerprint, invariant, plainObject, rejectKeysDeep,
  rejectUnknown, requireArray, requireEnum, requireObject, requireString, sameCanonical, verifyHash,
} from './primitives.js';
import {
  ApplicabilityStatus, Certification, ClaimType, EvidenceClass, GoalStatus, GoalType,
  PHYSICAL_FIELDS, ResolutionStatus, SYNTHESIS_FORBIDDEN_FIELDS,
} from './enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AXIS_STATUSES = ['BOUND', 'OMITTED', 'NOT_APPLICABLE', 'UNSPECIFIED'];

function date(value, path) {
  invariant(DATE.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'INVALID_DATE', path);
}
function period(value, path = '$.period') {
  rejectUnknown(value, ['date_from', 'date_to', 'period_status', 'timezone', 'anchor_timestamp', 'temporal_policy_ref'], path);
  date(value.date_from, `${path}.date_from`); date(value.date_to, `${path}.date_to`);
  invariant(value.date_from <= value.date_to, 'INVALID_PERIOD', path);
  requireEnum(value.period_status, ['CLOSED', 'OPEN', 'PARTIAL'], `${path}.period_status`);
  requireString(value.timezone, `${path}.timezone`);
  invariant(TIMESTAMP.test(value.anchor_timestamp || ''), 'INVALID_TIMESTAMP', `${path}.anchor_timestamp`);
  requireString(value.temporal_policy_ref, `${path}.temporal_policy_ref`);
}
function bindingPeriod(value, path) {
  rejectUnknown(value, ['date_from','date_to','period_status','timezone','anchor_timestamp','temporal_policy_ref','quantity','unit','alignment'], path);
  const base = Object.fromEntries(Object.entries(value).filter(([key]) => !['quantity','unit','alignment'].includes(key)));
  period(base, path);
  invariant(Number.isInteger(value.quantity) && value.quantity > 0, 'INVALID_INTEGER', `${path}.quantity`);
  requireEnum(value.unit, ['DAY','WEEK','MONTH','QUARTER','SEMESTER','YEAR'], `${path}.unit`);
  requireEnum(value.alignment, ['CALENDAR','ROLLING'], `${path}.alignment`);
}
function semanticPeriod(value, path) {
  rejectUnknown(value, ['anchor', 'quantity', 'unit', 'closure', 'alignment'], path);
  requireEnum(value.anchor, ['EXPLICIT', 'LAST', 'CURRENT'], `${path}.anchor`);
  invariant(Number.isInteger(value.quantity) && value.quantity > 0, 'INVALID_INTEGER', `${path}.quantity`);
  requireEnum(value.unit, ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'SEMESTER', 'YEAR'], `${path}.unit`);
  requireEnum(value.closure, ['CLOSED', 'CURRENT'], `${path}.closure`);
  requireEnum(value.alignment, ['CALENDAR', 'ROLLING'], `${path}.alignment`);
}
function axisBinding(value, path) {
  rejectUnknown(value, ['status', 'value', 'authority_required'], path);
  requireEnum(value.status, AXIS_STATUSES, `${path}.status`);
  if (value.status === 'BOUND') requireString(value.value, `${path}.value`);
  else invariant(!Object.hasOwn(value, 'value'), 'VALUE_FOR_UNBOUND_AXIS', `${path}.value`);
  if (Object.hasOwn(value, 'authority_required')) invariant(typeof value.authority_required === 'boolean', 'INVALID_BOOLEAN', `${path}.authority_required`);
}
function canonicalSubject(value, path) {
  rejectUnknown(value, ['entity_type', 'canonical_id', 'canonical_label', 'resolution_status', 'authority_ref'], path);
  requireEnum(value.entity_type, ['COMPANY', 'STORE', 'SELLER', 'BRAND', 'MODEL'], `${path}.entity_type`);
  requireString(value.canonical_id, `${path}.canonical_id`); requireString(value.canonical_label, `${path}.canonical_label`);
  requireEnum(value.resolution_status, Object.values(ResolutionStatus), `${path}.resolution_status`);
  requireString(value.authority_ref, `${path}.authority_ref`);
}
function semanticBinding(value, path = '$.bindings') {
  rejectUnknown(value, ['subject', 'measure', 'commercial_universe', 'organization_scope', 'period', 'grain'], path);
  canonicalSubject(value.subject, `${path}.subject`);
  requireString(value.measure, `${path}.measure`); requireString(value.commercial_universe, `${path}.commercial_universe`);
  requireString(value.organization_scope, `${path}.organization_scope`); bindingPeriod(value.period, `${path}.period`);
  requireString(value.grain, `${path}.grain`);
}
function stringList(value, path, { nonEmpty = true } = {}) {
  requireArray(value, path, { nonEmpty });
  value.forEach((item, index) => requireString(item, `${path}[${index}]`));
  invariant(new Set(value).size === value.length, 'DUPLICATE_VALUE', path);
}
function rejectUnexpectedNull(value, path = '$') {
  if (value === null) {
    invariant(path === '$.comparison.reference_expression', 'AMBIGUOUS_NULL_FORBIDDEN', path);
    return;
  }
  if (Array.isArray(value)) value.forEach((item, index) => rejectUnexpectedNull(item, `${path}[${index}]`));
  else if (plainObject(value)) Object.entries(value).forEach(([key, child]) => rejectUnexpectedNull(child, `${path}.${key}`));
}
function finalized(draft, hashField, validator, exclude = []) {
  const output = finalizeWithHash(draft, hashField, exclude);
  validator(output);
  return output;
}

export function validateQuestionContract(value) {
  rejectUnknown(value, ['contract_version','question_id','version','original_question','subject','period','scope','comparison','grain','semantic_intent','explicit_constraints','deferred_choice_axes','field_provenance','applied_policy_refs','question_contract_hash'], '$');
  requireEnum(value.contract_version, ['question_contract.v1'], '$.contract_version'); requireString(value.question_id, '$.question_id');
  invariant(value.version === 1, 'INVALID_VERSION', '$.version'); requireString(value.original_question, '$.original_question');
  rejectUnknown(value.subject, ['expression','type_constraints','reference_kind','authority_resolution_required'], '$.subject');
  requireString(value.subject.expression, '$.subject.expression'); stringList(value.subject.type_constraints, '$.subject.type_constraints');
  requireEnum(value.subject.reference_kind, ['DIRECT','INDIRECT'], '$.subject.reference_kind'); invariant(typeof value.subject.authority_resolution_required === 'boolean', 'INVALID_BOOLEAN', '$.subject.authority_resolution_required');
  invariant(!Object.hasOwn(value.subject, 'canonical_id'), 'FORBIDDEN_FIELD', '$.subject.canonical_id');
  rejectUnknown(value.period, ['semantic','materialized'], '$.period'); semanticPeriod(value.period.semantic, '$.period.semantic'); period(value.period.materialized, '$.period.materialized');
  rejectUnknown(value.scope, ['commercial_universe','organization_scope','market_universe','geography'], '$.scope');
  requireString(value.scope.commercial_universe, '$.scope.commercial_universe');
  axisBinding(value.scope.organization_scope, '$.scope.organization_scope'); axisBinding(value.scope.market_universe, '$.scope.market_universe'); axisBinding(value.scope.geography, '$.scope.geography');
  rejectUnknown(value.comparison, ['relation','reference_expression'], '$.comparison'); requireEnum(value.comparison.relation, ['NONE','YOY','PREVIOUS_PERIOD','MARKET','PEERS'], '$.comparison.relation');
  invariant(value.comparison.relation !== 'NONE' || value.comparison.reference_expression === null, 'INVALID_COMPARISON_REFERENCE', '$.comparison.reference_expression');
  requireString(value.grain, '$.grain');
  rejectUnknown(value.semantic_intent, ['operation','breadth','expressed_concepts','explicit_conjunction'], '$.semantic_intent');
  requireEnum(value.semantic_intent.operation, ['OBSERVE'], '$.semantic_intent.operation'); requireEnum(value.semantic_intent.breadth, ['FOCUSED','BROAD'], '$.semantic_intent.breadth'); stringList(value.semantic_intent.expressed_concepts, '$.semantic_intent.expressed_concepts'); invariant(typeof value.semantic_intent.explicit_conjunction === 'boolean', 'INVALID_BOOLEAN', '$.semantic_intent.explicit_conjunction');
  requireArray(value.explicit_constraints, '$.explicit_constraints'); requireArray(value.deferred_choice_axes, '$.deferred_choice_axes');
  requireObject(value.field_provenance, '$.field_provenance'); invariant(Object.keys(value.field_provenance).length > 0, 'MISSING_PROVENANCE', '$.field_provenance'); stringList(value.applied_policy_refs, '$.applied_policy_refs');
  rejectUnexpectedNull(value);
  rejectKeysDeep(value, new Set([...PHYSICAL_FIELDS, 'canonical_id']), '$'); verifyHash(value, 'question_contract_hash', ['question_id']);
  return true;
}
export function createQuestionContract(draft) { return finalized(draft, 'question_contract_hash', validateQuestionContract, ['question_id']); }

export function validateUniverseResolution(value) {
  rejectUnknown(value, ['contract_version','resolution_id','question_contract_ref','subject','membership','temporal','coverage','authority','resolution_fingerprint'], '$');
  requireEnum(value.contract_version, ['universe_resolution.v1'], '$.contract_version'); requireString(value.resolution_id, '$.resolution_id'); requireString(value.question_contract_ref, '$.question_contract_ref');
  canonicalSubject(value.subject, '$.subject');
  rejectUnknown(value.membership, ['commercial_universe','organization_scope','market_universe','geography'], '$.membership');
  requireString(value.membership.commercial_universe, '$.membership.commercial_universe'); axisBinding(value.membership.organization_scope, '$.membership.organization_scope'); axisBinding(value.membership.market_universe, '$.membership.market_universe'); axisBinding(value.membership.geography, '$.membership.geography');
  rejectUnknown(value.temporal, ['effective_period'], '$.temporal'); period(value.temporal.effective_period, '$.temporal.effective_period');
  rejectUnknown(value.coverage, ['identity','membership'], '$.coverage'); requireEnum(value.coverage.identity, Object.values(Certification), '$.coverage.identity'); requireEnum(value.coverage.membership, Object.values(Certification), '$.coverage.membership');
  rejectUnknown(value.authority, ['identity_ref','membership_ref'], '$.authority'); requireString(value.authority.identity_ref, '$.authority.identity_ref'); requireString(value.authority.membership_ref, '$.authority.membership_ref');
  verifyHash(value, 'resolution_fingerprint', ['resolution_id']); return true;
}
export function createUniverseResolution(draft) { return finalized(draft, 'resolution_fingerprint', validateUniverseResolution, ['resolution_id']); }

export function validateGoalInstance(value) {
  rejectUnknown(value, ['contract_version','goal_id','question_contract_ref','universe_resolution_ref','goal_type','evidence_class','origin','status','bindings','goal_fingerprint'], '$');
  requireEnum(value.contract_version, ['goal_instance.v1'], '$.contract_version'); requireString(value.goal_id, '$.goal_id'); requireString(value.question_contract_ref, '$.question_contract_ref'); requireString(value.universe_resolution_ref, '$.universe_resolution_ref');
  requireEnum(value.goal_type, Object.values(GoalType), '$.goal_type'); requireEnum(value.evidence_class, Object.values(EvidenceClass), '$.evidence_class'); requireEnum(value.origin, ['USER_EXPRESSED','INITIAL_CANDIDATE','SYSTEM_DERIVED'], '$.origin'); requireEnum(value.status, Object.values(GoalStatus), '$.status'); semanticBinding(value.bindings);
  rejectKeysDeep(value, PHYSICAL_FIELDS, '$'); verifyHash(value, 'goal_fingerprint', ['goal_id']); return true;
}
export function createGoalInstance(draft) { return finalized(draft, 'goal_fingerprint', validateGoalInstance, ['goal_id']); }

export function validateCapabilityContract(value) {
  rejectUnknown(value, ['contract_version','capability_contract_id','supports','authority_requirements','availability_requirements','permitted_claim_types','physical_executor_ref','request_projector_ref','evidence_projector_ref','capability_fingerprint'], '$');
  requireEnum(value.contract_version, ['capability_contract.v1'], '$.contract_version'); requireString(value.capability_contract_id, '$.capability_contract_id');
  rejectUnknown(value.supports, ['goal_types','entity_types','measures','commercial_universes','organization_scopes','period_units','period_statuses','period_alignments','comparisons','grains'], '$.supports');
  for (const key of Object.keys(value.supports)) stringList(value.supports[key], `$.supports.${key}`);
  rejectUnknown(value.authority_requirements, ['identity','membership'], '$.authority_requirements'); invariant(value.authority_requirements.identity === true && value.authority_requirements.membership === true, 'INVALID_AUTHORITY_REQUIREMENT', '$.authority_requirements');
  rejectUnknown(value.availability_requirements, ['status','through_period_end','minimum_coverage_ratio'], '$.availability_requirements'); requireEnum(value.availability_requirements.status, ['AVAILABLE'], '$.availability_requirements.status'); invariant(value.availability_requirements.through_period_end === true, 'INVALID_AVAILABILITY_REQUIREMENT', '$.availability_requirements.through_period_end'); invariant(typeof value.availability_requirements.minimum_coverage_ratio === 'number' && value.availability_requirements.minimum_coverage_ratio >= 0 && value.availability_requirements.minimum_coverage_ratio <= 1, 'INVALID_COVERAGE_THRESHOLD', '$.availability_requirements.minimum_coverage_ratio');
  stringList(value.permitted_claim_types, '$.permitted_claim_types', { nonEmpty: false }); value.permitted_claim_types.forEach((item, index) => requireEnum(item, Object.values(ClaimType), `$.permitted_claim_types[${index}]`));
  requireString(value.physical_executor_ref, '$.physical_executor_ref'); requireString(value.request_projector_ref, '$.request_projector_ref'); requireString(value.evidence_projector_ref, '$.evidence_projector_ref'); verifyHash(value, 'capability_fingerprint'); return true;
}
export function createCapabilityContract(draft) { return finalized(draft, 'capability_fingerprint', validateCapabilityContract); }

export function validateAvailabilitySnapshot(value) {
  rejectUnknown(value, ['snapshot_id','status','through','coverage_ratio','authority_refs'], '$'); requireString(value.snapshot_id, '$.snapshot_id'); requireEnum(value.status, ['AVAILABLE','UNAVAILABLE'], '$.status'); date(value.through, '$.through'); invariant(typeof value.coverage_ratio === 'number' && value.coverage_ratio >= 0 && value.coverage_ratio <= 1, 'INVALID_COVERAGE', '$.coverage_ratio'); stringList(value.authority_refs, '$.authority_refs'); return true;
}

export function validateApplicabilityDecision(value) {
  rejectUnknown(value, ['contract_version','decision_id','goal_ref','capability_contract_ref','universe_resolution_ref','availability_snapshot_ref','status','reason_codes','authorized_claim_types','decision_fingerprint'], '$');
  requireEnum(value.contract_version, ['applicability_decision.v1'], '$.contract_version'); requireString(value.decision_id, '$.decision_id'); requireString(value.goal_ref, '$.goal_ref'); requireString(value.capability_contract_ref, '$.capability_contract_ref'); requireString(value.universe_resolution_ref, '$.universe_resolution_ref'); requireString(value.availability_snapshot_ref, '$.availability_snapshot_ref'); requireEnum(value.status, Object.values(ApplicabilityStatus), '$.status'); stringList(value.reason_codes, '$.reason_codes', { nonEmpty: value.status === ApplicabilityStatus.NOT_APPLICABLE }); stringList(value.authorized_claim_types, '$.authorized_claim_types', { nonEmpty: value.status !== ApplicabilityStatus.NOT_APPLICABLE }); invariant(value.status !== ApplicabilityStatus.NOT_APPLICABLE || value.authorized_claim_types.length === 0, 'CLAIMS_AUTHORIZED_WHEN_NOT_APPLICABLE', '$.authorized_claim_types'); verifyHash(value, 'decision_fingerprint', ['decision_id']); return true;
}
export function createApplicabilityDecision(draft) { return finalized(draft, 'decision_fingerprint', validateApplicabilityDecision, ['decision_id']); }

export function validateAction(value) {
  rejectUnknown(value, ['contract_version','action_id','protocol_id','issued_state_version','goal_id','goal_type','evidence_class','semantic_label','description','public_bindings','expected_contribution','limitations','action_fingerprint'], '$');
  requireEnum(value.contract_version, ['action.v1'], '$.contract_version'); requireString(value.action_id, '$.action_id'); requireString(value.protocol_id, '$.protocol_id'); invariant(Number.isInteger(value.issued_state_version) && value.issued_state_version > 0, 'INVALID_STATE_VERSION', '$.issued_state_version'); requireString(value.goal_id, '$.goal_id'); requireEnum(value.goal_type, Object.values(GoalType), '$.goal_type'); requireEnum(value.evidence_class, Object.values(EvidenceClass), '$.evidence_class'); requireString(value.semantic_label, '$.semantic_label'); requireString(value.description, '$.description');
  rejectUnknown(value.public_bindings, ['subject','measure','commercial_universe','organization_scope','period','grain'], '$.public_bindings'); requireString(value.public_bindings.subject, '$.public_bindings.subject'); requireString(value.public_bindings.measure, '$.public_bindings.measure'); requireString(value.public_bindings.commercial_universe, '$.public_bindings.commercial_universe'); requireString(value.public_bindings.organization_scope, '$.public_bindings.organization_scope'); bindingPeriod(value.public_bindings.period, '$.public_bindings.period'); requireString(value.public_bindings.grain, '$.public_bindings.grain'); stringList(value.expected_contribution, '$.expected_contribution'); requireArray(value.limitations, '$.limitations');
  rejectKeysDeep(value, PHYSICAL_FIELDS, '$'); verifyHash(value, 'action_fingerprint', ['action_id','protocol_id','goal_id']); return true;
}
export function createAction(draft) { return finalized(draft, 'action_fingerprint', validateAction, ['action_id','protocol_id','goal_id']); }

export function validateExecutionAuthorization(value) {
  rejectUnknown(value, ['contract_version','execution_id','protocol_id','source_action_id','issued_state_version','goal_id','capability_contract_ref','applicability_decision_ref','effective_binding','universe_resolution_ref','availability_snapshot_ref','authorized_claim_types','physical_request','physical_request_fingerprint','execution_fingerprint','status'], '$');
  requireEnum(value.contract_version, ['execution_authorization.v1'], '$.contract_version'); for (const key of ['execution_id','protocol_id','source_action_id','goal_id','capability_contract_ref','applicability_decision_ref','universe_resolution_ref','availability_snapshot_ref']) requireString(value[key], `$.${key}`); invariant(Number.isInteger(value.issued_state_version) && value.issued_state_version > 0, 'INVALID_STATE_VERSION', '$.issued_state_version'); semanticBinding(value.effective_binding, '$.effective_binding'); stringList(value.authorized_claim_types, '$.authorized_claim_types'); requireObject(value.physical_request, '$.physical_request'); requireEnum(value.status, ['AUTHORIZED'], '$.status'); invariant(value.physical_request_fingerprint === fingerprint(value.physical_request), 'FINGERPRINT_MISMATCH', '$.physical_request_fingerprint'); verifyHash(value, 'execution_fingerprint', ['execution_id']); return true;
}
export function createExecutionAuthorization(draft) { return finalized(draft, 'execution_fingerprint', validateExecutionAuthorization, ['execution_id']); }

function validateClaim(value, path) {
  rejectUnknown(value, ['claim_type','value','unit','subject','period','scope','grain'], path); requireEnum(value.claim_type, Object.values(ClaimType), `${path}.claim_type`); invariant(typeof value.value === 'number' && Number.isFinite(value.value), 'INVALID_CLAIM_VALUE', `${path}.value`); requireEnum(value.unit, ['VIN'], `${path}.unit`); canonicalSubject(value.subject, `${path}.subject`); bindingPeriod(value.period, `${path}.period`); rejectUnknown(value.scope, ['commercial_universe','organization_scope'], `${path}.scope`); requireString(value.scope.commercial_universe, `${path}.scope.commercial_universe`); requireString(value.scope.organization_scope, `${path}.scope.organization_scope`); requireString(value.grain, `${path}.grain`);
}
function bindingFromClaim(claim) {
  return {
    subject: claim.subject,
    measure: claim.unit === 'VIN' ? 'VIN_SALES' : claim.unit,
    commercial_universe: claim.scope.commercial_universe,
    organization_scope: claim.scope.organization_scope,
    period: claim.period,
    grain: claim.grain,
  };
}
export function validateEvidenceRecord(value) {
  rejectUnknown(value, ['contract_version','evidence_id','execution_id','action_id','goal_ids','capability_contract_ref','semantic_binding','execution_status','claims','coverage','authority','provenance','execution_fingerprint','evidence_fingerprint'], '$'); requireEnum(value.contract_version, ['evidence_record.v1'], '$.contract_version'); for (const key of ['evidence_id','execution_id','action_id','capability_contract_ref','execution_fingerprint']) requireString(value[key], `$.${key}`); stringList(value.goal_ids, '$.goal_ids'); semanticBinding(value.semantic_binding, '$.semantic_binding'); requireEnum(value.execution_status, ['SUCCESS','FAILURE'], '$.execution_status'); requireArray(value.claims, '$.claims'); value.claims.forEach((item,index) => { validateClaim(item, `$.claims[${index}]`); invariant(bindingEquals(bindingFromClaim(item), value.semantic_binding), 'CLAIM_BINDING_MISMATCH', `$.claims[${index}]`); }); rejectUnknown(value.coverage, ['status','ratio','threshold_met'], '$.coverage'); requireEnum(value.coverage.status, ['CERTIFIED','LIMITED','MISSING'], '$.coverage.status'); invariant(typeof value.coverage.ratio === 'number' && value.coverage.ratio >= 0 && value.coverage.ratio <= 1, 'INVALID_COVERAGE', '$.coverage.ratio'); invariant(typeof value.coverage.threshold_met === 'boolean', 'INVALID_BOOLEAN', '$.coverage.threshold_met'); rejectUnknown(value.authority, ['identity_ref','membership_ref'], '$.authority'); requireString(value.authority.identity_ref, '$.authority.identity_ref'); requireString(value.authority.membership_ref, '$.authority.membership_ref'); invariant(plainObject(value.provenance) && Object.keys(value.provenance).length > 0, 'MISSING_PROVENANCE', '$.provenance'); rejectKeysDeep(value, new Set(['raw','raw_payload','motor_payload']), '$'); verifyHash(value, 'evidence_fingerprint', ['evidence_id']); return true;
}
export function createEvidenceRecord(draft) { return finalized(draft, 'evidence_fingerprint', validateEvidenceRecord, ['evidence_id']); }

export function validateSufficiencyEvaluation(value) {
  rejectUnknown(value, ['contract_version','evaluation_id','goal_id','goal_status','admitted_evidence_ids','rejected_evidence_ids','reason_codes','authorized_claim_types','evaluation_fingerprint'], '$'); requireEnum(value.contract_version, ['sufficiency_evaluation.v1'], '$.contract_version'); requireString(value.evaluation_id, '$.evaluation_id'); requireString(value.goal_id, '$.goal_id'); requireEnum(value.goal_status, Object.values(GoalStatus), '$.goal_status'); stringList(value.admitted_evidence_ids, '$.admitted_evidence_ids', { nonEmpty: value.goal_status === GoalStatus.SATISFIED }); stringList(value.rejected_evidence_ids, '$.rejected_evidence_ids', { nonEmpty: false }); stringList(value.reason_codes, '$.reason_codes', { nonEmpty: value.goal_status !== GoalStatus.SATISFIED }); stringList(value.authorized_claim_types, '$.authorized_claim_types', { nonEmpty: value.goal_status === GoalStatus.SATISFIED }); verifyHash(value, 'evaluation_fingerprint', ['evaluation_id']); return true;
}
export function createSufficiencyEvaluation(draft) { return finalized(draft, 'evaluation_fingerprint', validateSufficiencyEvaluation, ['evaluation_id']); }

export function validateSynthesisPacket(value) {
  rejectUnknown(value, ['contract_version','question_contract_public_view','outcome','satisfied_goals','unresolved_goals','authorized_claims','limitations','provenance_summary','forbidden_inferences','response_constraints','packet_hash'], '$'); requireEnum(value.contract_version, ['synthesis_packet.v1'], '$.contract_version'); requireObject(value.question_contract_public_view, '$.question_contract_public_view'); requireEnum(value.outcome, ['COMPLETE','PARTIAL','INSUFFICIENT'], '$.outcome'); stringList(value.satisfied_goals, '$.satisfied_goals', { nonEmpty: false }); stringList(value.unresolved_goals, '$.unresolved_goals', { nonEmpty: false }); requireArray(value.authorized_claims, '$.authorized_claims'); requireArray(value.limitations, '$.limitations'); requireArray(value.provenance_summary, '$.provenance_summary'); stringList(value.forbidden_inferences, '$.forbidden_inferences'); requireObject(value.response_constraints, '$.response_constraints'); rejectKeysDeep(value, SYNTHESIS_FORBIDDEN_FIELDS, '$'); verifyHash(value, 'packet_hash'); return true;
}
export function createSynthesisPacket(draft) { return finalized(draft, 'packet_hash', validateSynthesisPacket); }

export function bindingEquals(left, right) { return sameCanonical(left, right); }
export function cloneBinding(value) { semanticBinding(value); return clone(value); }
export function immutable(value) { return deepFreeze(value); }
