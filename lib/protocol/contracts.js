import {
  clone, deepFreeze, finalizeWithHash, fingerprint, invariant, plainObject, rejectKeysDeep,
  rejectUnknown, requireArray, requireEnum, requireObject, requireString, sameCanonical, verifyHash,
} from './primitives.js';
import {
  ApplicabilityStatus, AuthorityType, Certification, ClaimType, EvidenceClass, GoalStatus, GoalType,
  PHYSICAL_FIELDS, ResolutionStatus, SYNTHESIS_FORBIDDEN_FIELDS,
} from './enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AXIS_STATUSES = ['BOUND', 'OMITTED', 'NOT_APPLICABLE', 'UNSPECIFIED', 'AUTHORITY_PENDING', 'DEFERRED_SELECTION'];
const SEMANTIC_OPERATIONS = ['OBSERVE', 'PROJECT', 'COMPARE', 'ASSESS', 'EXPLAIN'];
const SEMANTIC_CONCEPTS = ['RESULT', 'EXPECTATION', 'TEMPORAL_BEHAVIOR', 'RELATIVE_REFERENCE', 'MARKET_POSITION', 'RISK', 'CHANGE_CONTRIBUTION', 'CONCENTRATION', 'SIGNAL', 'ASSOCIATION', 'FLOW', 'LEAKAGE'];

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
function questionPeriod(value, path) {
  if (Object.hasOwn(value ?? {}, 'status')) {
    axisBinding(value, path);
    invariant(['OMITTED', 'DEFERRED_SELECTION'].includes(value.status), 'INVALID_QUESTION_PERIOD_STATUS', `${path}.status`);
    return;
  }
  rejectUnknown(value, ['semantic','materialized'], path);
  semanticPeriod(value.semantic, `${path}.semantic`);
  period(value.materialized, `${path}.materialized`);
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

export function validateAuthorityRef(value, path = '$') {
  rejectUnknown(value, ['authority_type','authority_name','authority_version','snapshot_ref','effective_period','authority_fingerprint'], path);
  requireEnum(value.authority_type, Object.values(AuthorityType), `${path}.authority_type`);
  requireString(value.authority_name, `${path}.authority_name`); requireString(value.authority_version, `${path}.authority_version`); requireString(value.snapshot_ref, `${path}.snapshot_ref`);
  rejectUnknown(value.effective_period, ['date_from','date_to'], `${path}.effective_period`); date(value.effective_period.date_from, `${path}.effective_period.date_from`); date(value.effective_period.date_to, `${path}.effective_period.date_to`); invariant(value.effective_period.date_from <= value.effective_period.date_to, 'INVALID_PERIOD', `${path}.effective_period`);
  verifyHash(value, 'authority_fingerprint'); return true;
}
export function createAuthorityRef(draft) { return finalized(draft, 'authority_fingerprint', validateAuthorityRef); }

export function validateQuestionContract(value) {
  rejectUnknown(value, ['contract_version','question_id','version','original_question','subject','period','scope','comparison','grain','semantic_intent','explicit_constraints','deferred_choice_axes','resolved_ambiguity_refs','field_provenance','applied_policy_refs','question_contract_hash'], '$');
  requireEnum(value.contract_version, ['question_contract.v1'], '$.contract_version'); requireString(value.question_id, '$.question_id');
  invariant(value.version === 1, 'INVALID_VERSION', '$.version'); requireString(value.original_question, '$.original_question');
  rejectUnknown(value.subject, ['expression','type_constraints','reference_kind','authority_resolution_required'], '$.subject');
  requireString(value.subject.expression, '$.subject.expression'); stringList(value.subject.type_constraints, '$.subject.type_constraints');
  requireEnum(value.subject.reference_kind, ['DIRECT','INDIRECT','DEICTIC','ANAPHORIC','ELLIPTICAL'], '$.subject.reference_kind'); invariant(typeof value.subject.authority_resolution_required === 'boolean', 'INVALID_BOOLEAN', '$.subject.authority_resolution_required');
  invariant(!Object.hasOwn(value.subject, 'canonical_id'), 'FORBIDDEN_FIELD', '$.subject.canonical_id');
  questionPeriod(value.period, '$.period');
  rejectUnknown(value.scope, ['commercial_universe','organization_scope','market_universe','geography'], '$.scope');
  if (typeof value.scope.commercial_universe === 'string') requireString(value.scope.commercial_universe, '$.scope.commercial_universe');
  else axisBinding(value.scope.commercial_universe, '$.scope.commercial_universe');
  axisBinding(value.scope.organization_scope, '$.scope.organization_scope'); axisBinding(value.scope.market_universe, '$.scope.market_universe'); axisBinding(value.scope.geography, '$.scope.geography');
  if (Object.hasOwn(value.comparison ?? {}, 'status')) axisBinding(value.comparison, '$.comparison');
  else {
    rejectUnknown(value.comparison, ['relation','reference_expression'], '$.comparison'); requireEnum(value.comparison.relation, ['NONE','YOY','PREVIOUS_PERIOD','EXPECTED','MARKET','PEERS'], '$.comparison.relation');
    invariant(value.comparison.relation !== 'NONE' || value.comparison.reference_expression === null, 'INVALID_COMPARISON_REFERENCE', '$.comparison.reference_expression');
  }
  if (typeof value.grain === 'string') requireString(value.grain, '$.grain'); else axisBinding(value.grain, '$.grain');
  rejectUnknown(value.semantic_intent, ['operation','breadth','expressed_concepts','explicit_conjunction','causality'], '$.semantic_intent');
  requireEnum(value.semantic_intent.operation, SEMANTIC_OPERATIONS, '$.semantic_intent.operation'); requireEnum(value.semantic_intent.breadth, ['FOCUSED','BROAD'], '$.semantic_intent.breadth'); stringList(value.semantic_intent.expressed_concepts, '$.semantic_intent.expressed_concepts'); value.semantic_intent.expressed_concepts.forEach((concept,index)=>requireEnum(concept,SEMANTIC_CONCEPTS,`$.semantic_intent.expressed_concepts[${index}]`)); invariant(typeof value.semantic_intent.explicit_conjunction === 'boolean', 'INVALID_BOOLEAN', '$.semantic_intent.explicit_conjunction');
  if (Object.hasOwn(value.semantic_intent,'causality')) requireEnum(value.semantic_intent.causality,['NOT_AUTHORIZED','NOT_REQUESTED'],'$.semantic_intent.causality');
  requireArray(value.explicit_constraints, '$.explicit_constraints'); requireArray(value.deferred_choice_axes, '$.deferred_choice_axes');
  if (Object.hasOwn(value,'resolved_ambiguity_refs')) stringList(value.resolved_ambiguity_refs, '$.resolved_ambiguity_refs', { nonEmpty:false });
  requireObject(value.field_provenance, '$.field_provenance'); invariant(Object.keys(value.field_provenance).length > 0, 'MISSING_PROVENANCE', '$.field_provenance'); stringList(value.applied_policy_refs, '$.applied_policy_refs');
  rejectUnexpectedNull(value);
  rejectKeysDeep(value, new Set([...PHYSICAL_FIELDS, 'canonical_id']), '$'); verifyHash(value, 'question_contract_hash', ['question_id']);
  return true;
}
export function createQuestionContract(draft) { return finalized(draft, 'question_contract_hash', validateQuestionContract, ['question_id']); }

export function validateUniverseResolution(value) {
  if (Object.hasOwn(value ?? {}, 'request_fingerprint')) return validateDetailedUniverseResolution(value);
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

function validateResolutionCandidate(value, path) {
  rejectUnknown(value, ['canonical_id','canonical_label'], path); if (Object.hasOwn(value,'canonical_id')) requireString(value.canonical_id, `${path}.canonical_id`); requireString(value.canonical_label, `${path}.canonical_label`);
}
function validateDetailedUniverseResolution(value) {
  rejectUnknown(value, ['contract_version','resolution_id','question_contract_ref','request_fingerprint','subject','membership','temporal','grain','coverage','authority','limitations','resolution_fingerprint'], '$');
  requireEnum(value.contract_version, ['universe_resolution.v1'], '$.contract_version'); for (const key of ['resolution_id','question_contract_ref','request_fingerprint']) requireString(value[key], `$.${key}`);
  rejectUnknown(value.subject, ['expression','entity_type','canonical_id','canonical_label','resolution_status','authority_ref','candidates'], '$.subject'); requireString(value.subject.expression, '$.subject.expression'); requireEnum(value.subject.entity_type, ['COMPANY','STORE','SELLER','BRAND','MODEL'], '$.subject.entity_type'); requireEnum(value.subject.resolution_status, ['RESOLVED','AMBIGUOUS','NOT_FOUND','NOT_AUTHORIZED','UNSUPPORTED'], '$.subject.resolution_status'); validateAuthorityRef(value.subject.authority_ref, '$.subject.authority_ref'); requireArray(value.subject.candidates, '$.subject.candidates'); value.subject.candidates.forEach((item,index)=>validateResolutionCandidate(item,`$.subject.candidates[${index}]`));
  if(value.subject.resolution_status==='RESOLVED'){requireString(value.subject.canonical_id,'$.subject.canonical_id');requireString(value.subject.canonical_label,'$.subject.canonical_label');invariant(value.subject.candidates.length===0,'RESOLVED_WITH_CANDIDATES','$.subject.candidates');} else {invariant(!Object.hasOwn(value.subject,'canonical_id')&&!Object.hasOwn(value.subject,'canonical_label'),'UNRESOLVED_CANONICAL_IDENTITY','$.subject');invariant(value.subject.resolution_status!=='AMBIGUOUS'||value.subject.candidates.length>1,'AMBIGUOUS_REQUIRES_CANDIDATES','$.subject.candidates');}
  rejectUnknown(value.membership, ['commercial_universe','organization_scope','market_universe','geography','membership_status','membership_authority_refs'], '$.membership'); requireString(value.membership.commercial_universe,'$.membership.commercial_universe'); axisBinding(value.membership.organization_scope,'$.membership.organization_scope'); axisBinding(value.membership.market_universe,'$.membership.market_universe'); axisBinding(value.membership.geography,'$.membership.geography'); requireEnum(value.membership.membership_status,['RESOLVED','AMBIGUOUS','NOT_FOUND','NOT_AUTHORIZED','UNSUPPORTED'],'$.membership.membership_status'); requireArray(value.membership.membership_authority_refs,'$.membership.membership_authority_refs'); value.membership.membership_authority_refs.forEach((item,index)=>validateAuthorityRef(item,`$.membership.membership_authority_refs[${index}]`)); invariant(value.membership.membership_status!=='RESOLVED'||value.membership.membership_authority_refs.length>0,'MEMBERSHIP_AUTHORITY_REQUIRED','$.membership.membership_authority_refs');
  rejectUnknown(value.temporal,['date_from','date_to','effective_from','effective_to','period_status','temporal_status'],'$.temporal'); date(value.temporal.date_from,'$.temporal.date_from');date(value.temporal.date_to,'$.temporal.date_to');invariant(value.temporal.date_from<=value.temporal.date_to,'INVALID_PERIOD','$.temporal');date(value.temporal.effective_from,'$.temporal.effective_from');date(value.temporal.effective_to,'$.temporal.effective_to');invariant(value.temporal.effective_from<=value.temporal.effective_to,'INVALID_PERIOD','$.temporal');requireEnum(value.temporal.period_status,['CLOSED','OPEN','PARTIAL'],'$.temporal.period_status');requireEnum(value.temporal.temporal_status,['PRESERVED','PARTIAL','UNSUPPORTED'],'$.temporal.temporal_status');
  rejectUnknown(value.grain,['requested','resolved'],'$.grain');requireString(value.grain.requested,'$.grain.requested');requireString(value.grain.resolved,'$.grain.resolved');
  rejectUnknown(value.coverage,['identity','membership','temporal'],'$.coverage');for(const key of Object.keys(value.coverage))requireEnum(value.coverage[key],Object.values(Certification),`$.coverage.${key}`);
  rejectUnknown(value.authority,['identity_ref','membership_refs','temporal_ref'],'$.authority');validateAuthorityRef(value.authority.identity_ref,'$.authority.identity_ref');requireArray(value.authority.membership_refs,'$.authority.membership_refs');value.authority.membership_refs.forEach((item,index)=>validateAuthorityRef(item,`$.authority.membership_refs[${index}]`));validateAuthorityRef(value.authority.temporal_ref,'$.authority.temporal_ref');invariant(value.authority.identity_ref.authority_fingerprint===value.subject.authority_ref.authority_fingerprint,'IDENTITY_AUTHORITY_MISMATCH','$.authority.identity_ref');invariant(sameCanonical(value.authority.membership_refs,value.membership.membership_authority_refs),'MEMBERSHIP_AUTHORITY_MISMATCH','$.authority.membership_refs');
  stringList(value.limitations,'$.limitations',{nonEmpty:false}); rejectKeysDeep(value,PHYSICAL_FIELDS,'$'); verifyHash(value,'resolution_fingerprint',['resolution_id']); return true;
}

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
  if (Object.hasOwn(value ?? {}, 'contract_version')) return validateDetailedAvailabilitySnapshot(value);
  rejectUnknown(value, ['snapshot_id','status','through','coverage_ratio','authority_refs'], '$'); requireString(value.snapshot_id, '$.snapshot_id'); requireEnum(value.status, ['AVAILABLE','UNAVAILABLE'], '$.status'); date(value.through, '$.through'); invariant(typeof value.coverage_ratio === 'number' && value.coverage_ratio >= 0 && value.coverage_ratio <= 1, 'INVALID_COVERAGE', '$.coverage_ratio'); stringList(value.authority_refs, '$.authority_refs'); return true;
}

function validateAvailabilitySource(value,path) {
  rejectUnknown(value,['source_domain','authority_ref','data_status','temporal_semantics','available_from','available_to','snapshot_date','coverage','limitations'],path);requireEnum(value.source_domain,['SALES','RVM','CRM'],`${path}.source_domain`);validateAuthorityRef(value.authority_ref,`${path}.authority_ref`);requireEnum(value.data_status,['AVAILABLE','CONSOLIDATED','PRELIMINARY','CURRENT','UNAVAILABLE'],`${path}.data_status`);requireEnum(value.temporal_semantics,['PERIOD_COVERAGE','CURRENT_STATE'],`${path}.temporal_semantics`);if(Object.hasOwn(value,'available_from'))date(value.available_from,`${path}.available_from`);if(Object.hasOwn(value,'available_to'))date(value.available_to,`${path}.available_to`);invariant(Object.hasOwn(value,'available_from')===Object.hasOwn(value,'available_to'),'INCOMPLETE_AVAILABLE_PERIOD',path);if(Object.hasOwn(value,'available_from'))invariant(value.available_from<=value.available_to,'INVALID_PERIOD',path);if(Object.hasOwn(value,'snapshot_date'))date(value.snapshot_date,`${path}.snapshot_date`);invariant(value.data_status!=='PRELIMINARY'||Object.hasOwn(value,'snapshot_date'),'PRELIMINARY_SNAPSHOT_REQUIRED',`${path}.snapshot_date`);invariant(value.data_status!=='CONSOLIDATED'||!Object.hasOwn(value,'snapshot_date'),'CONSOLIDATED_SNAPSHOT_FORBIDDEN',`${path}.snapshot_date`);rejectUnknown(value.coverage,['status','ratio'],`${path}.coverage`);requireEnum(value.coverage.status,['FULL','PARTIAL','NONE'],`${path}.coverage.status`);invariant(typeof value.coverage.ratio==='number'&&value.coverage.ratio>=0&&value.coverage.ratio<=1,'INVALID_COVERAGE',`${path}.coverage.ratio`);invariant((value.coverage.status==='FULL')===(value.coverage.ratio===1),'COVERAGE_STATUS_RATIO_MISMATCH',`${path}.coverage`);invariant(value.coverage.status!=='NONE'||value.coverage.ratio===0,'COVERAGE_STATUS_RATIO_MISMATCH',`${path}.coverage`);invariant(value.coverage.status==='NONE'||Object.hasOwn(value,'available_from'),'COVERAGE_PERIOD_REQUIRED',path);invariant(value.data_status!=='UNAVAILABLE'||(value.coverage.status==='NONE'&&!Object.hasOwn(value,'available_from')),'UNAVAILABLE_SOURCE_HAS_COVERAGE',path);stringList(value.limitations,`${path}.limitations`,{nonEmpty:false});
}
function validateDetailedAvailabilitySnapshot(value) {
  rejectUnknown(value,['contract_version','snapshot_id','observed_at','question_contract_ref','requested_period','sources','snapshot_fingerprint'],'$');requireEnum(value.contract_version,['availability_snapshot.v1'],'$.contract_version');requireString(value.snapshot_id,'$.snapshot_id');invariant(TIMESTAMP.test(value.observed_at||''),'INVALID_TIMESTAMP','$.observed_at');requireString(value.question_contract_ref,'$.question_contract_ref');rejectUnknown(value.requested_period,['date_from','date_to','period_status'],'$.requested_period');date(value.requested_period.date_from,'$.requested_period.date_from');date(value.requested_period.date_to,'$.requested_period.date_to');requireEnum(value.requested_period.period_status,['CLOSED','OPEN','PARTIAL'],'$.requested_period.period_status');requireArray(value.sources,'$.sources');value.sources.forEach((item,index)=>validateAvailabilitySource(item,`$.sources[${index}]`));invariant(new Set(value.sources.map(item=>`${item.source_domain}:${item.data_status}:${item.snapshot_date??''}`)).size===value.sources.length,'DUPLICATE_AVAILABILITY_SOURCE','$.sources');rejectKeysDeep(value,PHYSICAL_FIELDS,'$');verifyHash(value,'snapshot_fingerprint',['snapshot_id']);return true;
}
export function createAvailabilitySnapshot(draft) { return finalized(draft,'snapshot_fingerprint',validateAvailabilitySnapshot,['snapshot_id']); }

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
