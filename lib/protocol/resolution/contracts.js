import { validateQuestionContract } from '../contracts.js';
import {
  clone, finalizeWithHash, fingerprint, invariant, rejectKeysDeep, rejectUnknown,
  requireArray, requireEnum, requireString, verifyHash,
} from '../primitives.js';
import { PHYSICAL_FIELDS } from '../enums.js';
import { validateExplicitConstraint } from '../grounding/contracts.js';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AXIS_STATUSES=['BOUND','OMITTED','NOT_APPLICABLE','UNSPECIFIED'];
const REFERENCES=['DIRECT','INDIRECT','DEICTIC','ANAPHORIC','ELLIPTICAL'];

function date(value,path){invariant(DATE.test(value||'')&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value,'INVALID_DATE',path);}
function axis(value,path){rejectUnknown(value,['status','value','authority_required'],path);requireEnum(value.status,AXIS_STATUSES,`${path}.status`);if(value.status==='BOUND')requireString(value.value,`${path}.value`);else invariant(!Object.hasOwn(value,'value'),'VALUE_FOR_UNBOUND_AXIS',`${path}.value`);if(Object.hasOwn(value,'authority_required'))invariant(typeof value.authority_required==='boolean','INVALID_BOOLEAN',`${path}.authority_required`);}
function period(value,path){rejectUnknown(value,['date_from','date_to','period_status','timezone','anchor_timestamp','temporal_policy_ref'],path);date(value.date_from,`${path}.date_from`);date(value.date_to,`${path}.date_to`);invariant(value.date_from<=value.date_to,'INVALID_PERIOD',path);requireEnum(value.period_status,['CLOSED','OPEN','PARTIAL'],`${path}.period_status`);requireString(value.timezone,`${path}.timezone`);invariant(TIMESTAMP.test(value.anchor_timestamp||''),'INVALID_TIMESTAMP',`${path}.anchor_timestamp`);requireString(value.temporal_policy_ref,`${path}.temporal_policy_ref`);}
function semanticProjection(value){return {subject:value.subject,requested_scope:value.requested_scope,requested_period:value.requested_period,requested_grain:value.requested_grain,explicit_constraints:value.explicit_constraints};}

export function validateUniverseResolutionRequest(value){
  rejectUnknown(value,['contract_version','request_id','question_contract_ref','subject','requested_scope','requested_period','requested_grain','explicit_constraints','semantic_fingerprint','request_fingerprint'],'$');requireEnum(value.contract_version,['universe_resolution_request.v1'],'$.contract_version');requireString(value.request_id,'$.request_id');requireString(value.question_contract_ref,'$.question_contract_ref');
  rejectUnknown(value.subject,['expression','type_constraints','reference_kind'],'$.subject');requireString(value.subject.expression,'$.subject.expression');requireArray(value.subject.type_constraints,'$.subject.type_constraints',{nonEmpty:true});value.subject.type_constraints.forEach((item,index)=>requireEnum(item,['COMPANY','STORE','SELLER','BRAND','MODEL','VERSION'],`$.subject.type_constraints[${index}]`));requireEnum(value.subject.reference_kind,REFERENCES,'$.subject.reference_kind');
  rejectUnknown(value.requested_scope,['commercial_universe','organization_scope','market_universe','geography'],'$.requested_scope');requireEnum(value.requested_scope.commercial_universe,['COMPANY','OWN_STORES','DEALERS','RVM_MARKET','PUBLISHED_CONDITIONS'],'$.requested_scope.commercial_universe');axis(value.requested_scope.organization_scope,'$.requested_scope.organization_scope');axis(value.requested_scope.market_universe,'$.requested_scope.market_universe');axis(value.requested_scope.geography,'$.requested_scope.geography');period(value.requested_period,'$.requested_period');requireString(value.requested_grain,'$.requested_grain');requireArray(value.explicit_constraints,'$.explicit_constraints');value.explicit_constraints.forEach((item,index)=>validateExplicitConstraint(item,`$.explicit_constraints[${index}]`));
  invariant(value.semantic_fingerprint===fingerprint(semanticProjection(value)),'FINGERPRINT_MISMATCH','$.semantic_fingerprint');rejectKeysDeep(value,new Set([...PHYSICAL_FIELDS,'canonical_id','canonical_label']),'$');verifyHash(value,'request_fingerprint',['request_id']);return true;
}

export function createUniverseResolutionRequest(draft){const out=clone(draft);out.semantic_fingerprint=fingerprint(semanticProjection(out));const finalized=finalizeWithHash(out,'request_fingerprint',['request_id']);validateUniverseResolutionRequest(finalized);return finalized;}

export function createUniverseResolutionRequestFromQuestionContract(question,{request_id='universe_request_fixture'}={}){
  validateQuestionContract(question);invariant(question.period?.materialized,'QUESTION_PERIOD_NOT_RESOLUTION_READY','$.period');invariant(typeof question.scope.commercial_universe==='string','QUESTION_SCOPE_NOT_RESOLUTION_READY','$.scope.commercial_universe');invariant(typeof question.grain==='string','QUESTION_GRAIN_NOT_RESOLUTION_READY','$.grain');
  return createUniverseResolutionRequest({contract_version:'universe_resolution_request.v1',request_id,question_contract_ref:question.question_contract_hash,subject:{expression:question.subject.expression,type_constraints:clone(question.subject.type_constraints),reference_kind:question.subject.reference_kind},requested_scope:clone(question.scope),requested_period:clone(question.period.materialized),requested_grain:question.grain,explicit_constraints:clone(question.explicit_constraints)});
}
