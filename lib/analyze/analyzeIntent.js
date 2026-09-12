import { CONTRACT_VERSIONS, validateIntent } from '../agent-architecture/contracts.js';
import { verifyResolutionToken } from '../resolve/resolutionToken.js';
import { decideIntent } from '../decide/decideIntent.js';
import { executeDecisionPlan } from './executeDecisionPlan.js';
import {
  issueContinuationToken,
  stableHash,
  verifyContinuationToken,
} from './continuationToken.js';

const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
function materializeIntent(raw,authority){
  const value={...raw,version:raw?.version??CONTRACT_VERSIONS.intent};
  value.question_type=value.question_type??authority.semantic_parse.question_type;
  value.entity=value.entity??{type:authority.entity.type,value:authority.entity.display_name};
  value.period=value.period??{...authority.period};
  value.comparison=value.comparison??authority.semantic_parse.comparison??authority.defaults?.comparison?.value??'NONE';
  value.depth=value.depth??authority.semantic_parse.depth??authority.defaults?.depth?.value??'STANDARD';
  value.scope=value.scope??{};
  value.scope={ organization_scope:value.scope.organization_scope??authority.semantic_parse.scope?.organization_scope??authority.defaults?.scope?.organization_scope??null, commercial_universe:value.scope.commercial_universe??authority.semantic_parse.scope?.commercial_universe??authority.defaults?.scope?.commercial_universe??null };
  value.semantic_provenance={
    question_type:'LLM_PARSED', entity:'BACKEND_RESOLVED', period:'BACKEND_RESOLVED',
    comparison:(raw?.comparison||authority.semantic_parse.comparison)?'USER_EXPRESSED':'DETERMINISTIC_DEFAULT',
    scope:(raw?.scope?.organization_scope||raw?.scope?.commercial_universe||authority.semantic_parse.scope?.organization_scope||authority.semantic_parse.scope?.commercial_universe)?'USER_EXPRESSED':'DETERMINISTIC_DEFAULT',
    depth:(raw?.depth||authority.semantic_parse.depth)?'USER_EXPRESSED':'DETERMINISTIC_DEFAULT',
  };
  return validateIntent(value);
}
function verifyIntentAgainstAuthority(intent,authority){
  if(intent.question_type!==authority.semantic_parse.question_type) throw Object.assign(new Error('INTENT_QUESTION_TYPE_DIFFERS_FROM_RESOLUTION'),{code:'INTENT_QUESTION_TYPE_DIFFERS_FROM_RESOLUTION'});
  if(intent.entity.type!==authority.entity.type || norm(intent.entity.value)!==norm(authority.entity.display_name)) throw Object.assign(new Error('INTENT_ENTITY_DIFFERS_FROM_RESOLUTION'),{code:'INTENT_ENTITY_DIFFERS_FROM_RESOLUTION'});
  for(const f of ['type','date_from','date_to']) if(String(intent.period[f])!==String(authority.period[f])) throw Object.assign(new Error(`INTENT_PERIOD_DIFFERS_FROM_RESOLUTION: ${f}`),{code:'INTENT_PERIOD_DIFFERS_FROM_RESOLUTION'});
  if(!authority.allowed.comparison.includes(intent.comparison)) throw Object.assign(new Error('INTENT_COMPARISON_NOT_ALLOWED'),{code:'INTENT_COMPARISON_NOT_ALLOWED'});
  if(!authority.allowed.depth.includes(intent.depth)) throw Object.assign(new Error('INTENT_DEPTH_NOT_ALLOWED'),{code:'INTENT_DEPTH_NOT_ALLOWED'});
  const s=intent.scope;
  if(s.organization_scope && !authority.allowed.scope.organization_scope.includes(s.organization_scope)) throw Object.assign(new Error('INTENT_ORGANIZATION_SCOPE_NOT_ALLOWED'),{code:'INTENT_ORGANIZATION_SCOPE_NOT_ALLOWED'});
  if(s.commercial_universe && !authority.allowed.scope.commercial_universe.includes(s.commercial_universe)) throw Object.assign(new Error('INTENT_COMMERCIAL_UNIVERSE_NOT_ALLOWED'),{code:'INTENT_COMMERCIAL_UNIVERSE_NOT_ALLOWED'});
}

export async function analyzeIntent(request={},options={}){
  const authority=verifyResolutionToken(request.resolution_id,{secret:options.tokenSecret,nowMs:options.nowMs});
  const intent=materializeIntent(request.intent??{},authority);
  verifyIntentAgainstAuthority(intent,authority);
  const plan=decideIntent(intent,authority);
  const fingerprints={
    resolution_hash:stableHash(request.resolution_id),
    plan_hash:stableHash(plan),
    intent_hash:stableHash(intent),
  };
  let continuationState;
  if(request.continuation_id){
    const continuation=verifyContinuationToken(request.continuation_id,{secret:options.tokenSecret,nowMs:options.nowMs});
    if(continuation.resolution_hash!==fingerprints.resolution_hash) throw Object.assign(new Error('CONTINUATION_RESOLUTION_MISMATCH'),{code:'CONTINUATION_RESOLUTION_MISMATCH'});
    if(continuation.plan_hash!==fingerprints.plan_hash) throw Object.assign(new Error('CONTINUATION_PLAN_MISMATCH'),{code:'CONTINUATION_PLAN_MISMATCH'});
    if(continuation.intent_hash!==fingerprints.intent_hash) throw Object.assign(new Error('CONTINUATION_INTENT_MISMATCH'),{code:'CONTINUATION_INTENT_MISMATCH'});
    continuationState=continuation.progress;
  }
  const executed=await executeDecisionPlan(plan,authority,intent,{executor:options.executor,includePrivateTrace:options.includePrivateTrace,continuationState});
  if(executed.analysis_iteration.status==='CONTINUE'){
    executed.analysis_iteration.continuation_id=issueContinuationToken({
      ...fingerprints,
      progress:executed._continuation_state,
    },{secret:options.tokenSecret,nowMs:options.nowMs,ttlMs:options.continuationTtlMs});
  }
  return executed;
}
