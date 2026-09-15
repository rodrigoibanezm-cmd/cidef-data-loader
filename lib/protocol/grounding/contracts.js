import {
  clone, deepFreeze, finalizeWithHash, invariant, plainObject, rejectKeysDeep, rejectUnknown,
  requireArray, requireEnum, requireObject, requireString, verifyHash,
} from '../primitives.js';
import { validateQuestionContract } from '../contracts.js';
import {
  ClarificationIssueKind, ConstraintAxis, ConstraintOperator, DRAFT_FORBIDDEN_FIELDS,
  GROUNDING_PROVENANCE, ProvenanceKind, SemanticConcept, SemanticFieldStatus, SemanticOperation,
} from './enums.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REFERENCES = ['DIRECT', 'DEICTIC', 'ANAPHORIC', 'ELLIPTICAL'];

function validDate(value) {
  return DATE.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function stringList(value, path, { nonEmpty = true } = {}) {
  requireArray(value, path, { nonEmpty }); value.forEach((item,index)=>requireString(item,`${path}[${index}]`));
  invariant(new Set(value).size === value.length, 'DUPLICATE_VALUE', path);
}
function provenance(value, path) { requireEnum(value, GROUNDING_PROVENANCE, path); }
function semanticField(value, path, allowedValues = null) {
  rejectUnknown(value, ['status','value','provenance'], path); requireEnum(value.status, SemanticFieldStatus, `${path}.status`);
  if (['BOUND','AUTHORITY_PENDING','DEFERRED_SELECTION'].includes(value.status)) {
    invariant(Object.hasOwn(value,'value'), 'MISSING_FIELD_VALUE', `${path}.value`); provenance(value.provenance, `${path}.provenance`);
  } else {
    invariant(!Object.hasOwn(value,'value'), 'VALUE_FOR_UNBOUND_FIELD', `${path}.value`);
    if (value.status==='OMITTED') provenance(value.provenance, `${path}.provenance`);
  }
  if (Object.hasOwn(value,'provenance')) provenance(value.provenance, `${path}.provenance`);
  if (allowedValues && Object.hasOwn(value,'value')) requireEnum(value.value, allowedValues, `${path}.value`);
}
function semanticPeriod(value, path) {
  rejectUnknown(value, ['anchor','quantity','unit','closure','alignment'], path);
  requireEnum(value.anchor,['EXPLICIT','LAST','CURRENT'],`${path}.anchor`);
  invariant(Number.isInteger(value.quantity)&&value.quantity>0,'INVALID_INTEGER',`${path}.quantity`);
  requireEnum(value.unit,['DAY','WEEK','MONTH','QUARTER','SEMESTER','YEAR'],`${path}.unit`);
  requireEnum(value.closure,['CLOSED','CURRENT'],`${path}.closure`);
  requireEnum(value.alignment,['CALENDAR','ROLLING'],`${path}.alignment`);
}
function materializedPeriod(value,path) {
  rejectUnknown(value,['date_from','date_to','period_status','timezone','anchor_timestamp','temporal_policy_ref'],path);
  invariant(validDate(value.date_from),'INVALID_DATE',`${path}.date_from`); invariant(validDate(value.date_to),'INVALID_DATE',`${path}.date_to`);
  invariant(value.date_from<=value.date_to,'INVALID_PERIOD',path); requireEnum(value.period_status,['CLOSED','PARTIAL','OPEN'],`${path}.period_status`);
  requireString(value.timezone,`${path}.timezone`); invariant(TIMESTAMP.test(value.anchor_timestamp||''),'INVALID_TIMESTAMP',`${path}.anchor_timestamp`); requireString(value.temporal_policy_ref,`${path}.temporal_policy_ref`);
}
function validateSubject(value,path='$.subject') {
  rejectUnknown(value,['status','expression','type_constraints','reference_kind','provenance'],path); requireEnum(value.status,SemanticFieldStatus,`${path}.status`);
  if (['BOUND','AUTHORITY_PENDING'].includes(value.status)) {
    requireString(value.expression,`${path}.expression`); stringList(value.type_constraints,`${path}.type_constraints`); requireEnum(value.reference_kind,REFERENCES,`${path}.reference_kind`); provenance(value.provenance,`${path}.provenance`);
  } else { invariant(!Object.hasOwn(value,'expression'),'VALUE_FOR_UNBOUND_FIELD',`${path}.expression`); if(value.status==='OMITTED')provenance(value.provenance,`${path}.provenance`); }
}
function validateTemporal(value,path='$.temporal') {
  rejectUnknown(value,['status','expression','semantic_period','materialized_period','provenance'],path); requireEnum(value.status,SemanticFieldStatus,`${path}.status`);
  if (value.status==='BOUND') {
    requireString(value.expression,`${path}.expression`); semanticPeriod(value.semantic_period,`${path}.semantic_period`); materializedPeriod(value.materialized_period,`${path}.materialized_period`); provenance(value.provenance,`${path}.provenance`);
  }
  if (value.status==='DEFERRED_SELECTION') provenance(value.provenance,`${path}.provenance`);
  if (value.status==='OMITTED') provenance(value.provenance,`${path}.provenance`);
}
function validateComparison(value,path='$.comparison') {
  rejectUnknown(value,['status','relation','reference_expression','provenance'],path); requireEnum(value.status,SemanticFieldStatus,`${path}.status`);
  if (value.status==='BOUND') {
    requireEnum(value.relation,['NONE','YOY','PREVIOUS_PERIOD','EXPECTED','MARKET','PEERS'],`${path}.relation`);
    invariant(value.relation!=='NONE'||value.reference_expression===null,'INVALID_COMPARISON_REFERENCE',`${path}.reference_expression`);
    provenance(value.provenance,`${path}.provenance`);
  }
  if (value.status==='DEFERRED_SELECTION') provenance(value.provenance,`${path}.provenance`);
  if (value.status==='OMITTED') provenance(value.provenance,`${path}.provenance`);
}
export function validateExplicitConstraint(value,path='$.explicit_constraints[]') {
  rejectUnknown(value,['constraint_id','target_axis','operator','value','provenance'],path); requireString(value.constraint_id,`${path}.constraint_id`); requireEnum(value.target_axis,ConstraintAxis,`${path}.target_axis`); requireEnum(value.operator,ConstraintOperator,`${path}.operator`); invariant(typeof value.value==='string'||Array.isArray(value.value),'INVALID_CONSTRAINT_VALUE',`${path}.value`); if(Array.isArray(value.value)) stringList(value.value,`${path}.value`); provenance(value.provenance,`${path}.provenance`); return true;
}
function validateIssue(value,path) {
  rejectUnknown(value,['issue_id','issue_kind','field_paths','reason_code','material','alternatives'],path); requireString(value.issue_id,`${path}.issue_id`); requireEnum(value.issue_kind,ClarificationIssueKind,`${path}.issue_kind`); stringList(value.field_paths,`${path}.field_paths`); requireString(value.reason_code,`${path}.reason_code`); invariant(typeof value.material==='boolean','INVALID_BOOLEAN',`${path}.material`); requireArray(value.alternatives,`${path}.alternatives`);
}

export function validateQuestionDraft(value) {
  rejectUnknown(value,['contract_version','protocol_id','original_question','source_utterances','conversation_context_ref','subject','temporal','scope','comparison','grain','semantic_intent','explicit_constraints','grounding_issues','deferred_choice_axes','field_provenance','applied_policy_refs','resolved_ambiguity_refs','draft_hash'],'$');
  requireEnum(value.contract_version,['question_draft.v1'],'$.contract_version'); requireString(value.protocol_id,'$.protocol_id'); requireString(value.original_question,'$.original_question'); stringList(value.source_utterances,'$.source_utterances');
  if (value.conversation_context_ref?.status==='OMITTED') rejectUnknown(value.conversation_context_ref,['status'],'$.conversation_context_ref'); else validateConversationContextRef(value.conversation_context_ref);
  validateSubject(value.subject); validateTemporal(value.temporal);
  rejectUnknown(value.scope,['commercial_universe','organization_scope','market_universe','geography'],'$.scope'); for(const axis of Object.keys(value.scope)) semanticField(value.scope[axis],`$.scope.${axis}`);
  validateComparison(value.comparison); semanticField(value.grain,'$.grain');
  rejectUnknown(value.semantic_intent,['operation','breadth','expressed_concepts','explicit_conjunction','causality'],'$.semantic_intent'); semanticField(value.semantic_intent.operation,'$.semantic_intent.operation',SemanticOperation); semanticField(value.semantic_intent.breadth,'$.semantic_intent.breadth',['FOCUSED','BROAD']); semanticField(value.semantic_intent.expressed_concepts,'$.semantic_intent.expressed_concepts'); if(Object.hasOwn(value.semantic_intent.expressed_concepts,'value')) { stringList(value.semantic_intent.expressed_concepts.value,'$.semantic_intent.expressed_concepts.value'); value.semantic_intent.expressed_concepts.value.forEach((item,index)=>requireEnum(item,SemanticConcept,`$.semantic_intent.expressed_concepts.value[${index}]`)); } invariant(typeof value.semantic_intent.explicit_conjunction==='boolean','INVALID_BOOLEAN','$.semantic_intent.explicit_conjunction'); requireEnum(value.semantic_intent.causality,['NOT_AUTHORIZED','NOT_REQUESTED'],'$.semantic_intent.causality');
  requireArray(value.explicit_constraints,'$.explicit_constraints'); value.explicit_constraints.forEach((item,index)=>validateExplicitConstraint(item,`$.explicit_constraints[${index}]`)); requireArray(value.grounding_issues,'$.grounding_issues'); value.grounding_issues.forEach((item,index)=>validateIssue(item,`$.grounding_issues[${index}]`)); stringList(value.deferred_choice_axes,'$.deferred_choice_axes',{nonEmpty:false}); requireObject(value.field_provenance,'$.field_provenance'); for(const [path,kind] of Object.entries(value.field_provenance)){requireString(path,'$.field_provenance.key');provenance(kind,`$.field_provenance.${path}`);} const provenanceFields={subject:value.subject,temporal:value.temporal,'scope.commercial_universe':value.scope.commercial_universe,'scope.organization_scope':value.scope.organization_scope,'scope.market_universe':value.scope.market_universe,'scope.geography':value.scope.geography,comparison:value.comparison,grain:value.grain,'semantic_intent.operation':value.semantic_intent.operation,'semantic_intent.breadth':value.semantic_intent.breadth,'semantic_intent.expressed_concepts':value.semantic_intent.expressed_concepts}; for(const [path,field] of Object.entries(provenanceFields))if(field.provenance)invariant(value.field_provenance[path]===field.provenance,'PROVENANCE_MISMATCH',`$.field_provenance.${path}`); for(const item of value.explicit_constraints)invariant(value.field_provenance[`explicit_constraints.${item.constraint_id}`]===item.provenance,'PROVENANCE_MISMATCH',`$.field_provenance.explicit_constraints.${item.constraint_id}`); stringList(value.applied_policy_refs,'$.applied_policy_refs',{nonEmpty:false}); stringList(value.resolved_ambiguity_refs,'$.resolved_ambiguity_refs',{nonEmpty:false});
  rejectKeysDeep(value,DRAFT_FORBIDDEN_FIELDS,'$'); verifyHash(value,'draft_hash',['protocol_id','original_question','source_utterances','conversation_context_ref']); return true;
}
export function createQuestionDraft(draft) { const out=finalizeWithHash(draft,'draft_hash',['protocol_id','original_question','source_utterances','conversation_context_ref']); validateQuestionDraft(out); return out; }

export function validateConversationContextRef(value) {
  rejectUnknown(value,['contract_version','context_id','prior_question_contract','allowed_fields','context_fingerprint'],'$.conversation_context_ref'); requireEnum(value.contract_version,['conversation_context_ref.v1'],'$.conversation_context_ref.contract_version'); requireString(value.context_id,'$.conversation_context_ref.context_id'); validateQuestionContract(value.prior_question_contract); stringList(value.allowed_fields,'$.conversation_context_ref.allowed_fields'); value.allowed_fields.forEach((field,index)=>requireEnum(field,['subject','period','scope','comparison','grain','semantic_intent'],`$.conversation_context_ref.allowed_fields[${index}]`)); verifyHash(value,'context_fingerprint',['context_id']); return true;
}
export function createConversationContextRef(draft) { const out=finalizeWithHash(draft,'context_fingerprint',['context_id']); validateConversationContextRef(out); return out; }

function validatePatch(value,path) { rejectUnknown(value,['path','value'],path); requireEnum(value.path,['subject','temporal','scope.commercial_universe','scope.organization_scope','scope.market_universe','scope.geography','comparison','grain','semantic_intent.operation','semantic_intent.breadth','semantic_intent.expressed_concepts'],`${path}.path`); invariant(plainObject(value.value),'INVALID_PATCH_VALUE',`${path}.value`); }
function validateOption(value,path) { rejectUnknown(value,['option_id','label','effect_summary','semantic_patch','option_fingerprint'],path); requireString(value.option_id,`${path}.option_id`); requireString(value.label,`${path}.label`); requireString(value.effect_summary,`${path}.effect_summary`); requireArray(value.semantic_patch,`${path}.semantic_patch`,{nonEmpty:true}); value.semantic_patch.forEach((patch,index)=>validatePatch(patch,`${path}.semantic_patch[${index}]`)); verifyHash(value,'option_fingerprint',['option_id']); }
export function createClarificationOption(draft) { const out=finalizeWithHash(draft,'option_fingerprint',['option_id']); validateOption(out,'$'); return out; }

export function validateClarificationRequest(value) {
  rejectUnknown(value,['contract_version','clarification_id','protocol_id','issued_state_version','question_draft_hash','request_fingerprint','issue_kind','field_paths','reason_code','prompt','options','allow_free_text','required','issued_at','expires_at'],'$'); requireEnum(value.contract_version,['clarification_request.v1'],'$.contract_version'); requireString(value.clarification_id,'$.clarification_id'); requireString(value.protocol_id,'$.protocol_id'); invariant(Number.isInteger(value.issued_state_version)&&value.issued_state_version>0,'INVALID_STATE_VERSION','$.issued_state_version'); requireString(value.question_draft_hash,'$.question_draft_hash'); requireEnum(value.issue_kind,ClarificationIssueKind,'$.issue_kind'); stringList(value.field_paths,'$.field_paths'); requireString(value.reason_code,'$.reason_code'); requireString(value.prompt,'$.prompt'); requireArray(value.options,'$.options'); value.options.forEach((item,index)=>validateOption(item,`$.options[${index}]`)); invariant(typeof value.allow_free_text==='boolean','INVALID_BOOLEAN','$.allow_free_text'); invariant(value.options.length>0||value.allow_free_text,'NO_CLARIFICATION_INPUT_MODE','$'); invariant(value.required===true,'CLARIFICATION_MUST_BE_REQUIRED','$.required'); invariant(TIMESTAMP.test(value.issued_at||'')&&TIMESTAMP.test(value.expires_at||''),'INVALID_TIMESTAMP','$'); invariant(value.issued_at<value.expires_at,'INVALID_EXPIRY','$.expires_at'); rejectKeysDeep(value,DRAFT_FORBIDDEN_FIELDS,'$'); verifyHash(value,'request_fingerprint',['clarification_id']); return true;
}
export function createClarificationRequest(draft) { const out=finalizeWithHash(draft,'request_fingerprint',['clarification_id']); validateClarificationRequest(out); return out; }

export function validateClarificationResponse(value) {
  rejectUnknown(value,['contract_version','response_id','protocol_id','clarification_id','issued_state_version','request_fingerprint','selected_option_id','free_text'],'$'); requireEnum(value.contract_version,['clarification_response.v1'],'$.contract_version'); for(const key of ['response_id','protocol_id','clarification_id','request_fingerprint'])requireString(value[key],`$.${key}`); invariant(Number.isInteger(value.issued_state_version)&&value.issued_state_version>0,'INVALID_STATE_VERSION','$.issued_state_version'); const selected=typeof value.selected_option_id==='string'&&value.selected_option_id.length>0; const free=typeof value.free_text==='string'&&value.free_text.trim().length>0; invariant(selected!==free,'CLARIFICATION_RESPONSE_XOR_REQUIRED','$'); return true;
}
export function createClarificationResponse(draft) { const out=deepFreeze(clone(draft)); validateClarificationResponse(out); return out; }

export function validateGroundingAnalysis(value) {
  rejectUnknown(value,['contract_version','question_draft_hash','material_ambiguity','requires_clarification','issues'],'$'); requireEnum(value.contract_version,['grounding_analysis.v1'],'$.contract_version'); requireString(value.question_draft_hash,'$.question_draft_hash'); invariant(typeof value.material_ambiguity==='boolean','INVALID_BOOLEAN','$.material_ambiguity'); invariant(typeof value.requires_clarification==='boolean','INVALID_BOOLEAN','$.requires_clarification'); requireArray(value.issues,'$.issues'); value.issues.forEach((item,index)=>validateIssue(item,`$.issues[${index}]`)); invariant(value.material_ambiguity===(value.issues.length>0)&&value.requires_clarification===value.material_ambiguity,'GROUNDING_ANALYSIS_INCONSISTENT','$'); return true;
}
