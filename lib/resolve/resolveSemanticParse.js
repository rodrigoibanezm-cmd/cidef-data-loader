import { CONTRACT_VERSIONS, DEPTHS, validateSemanticParse } from '../agent-architecture/contracts.js';
import { CIDEF_TIMEZONE, deriveTemporalMetadata } from '../temporal/periodMath.js';
import { resolveCanonicalEntity } from './entityResolver.js';
import { resolveAvailability } from './availabilityResolver.js';
import { issueResolutionToken } from './resolutionToken.js';

function comparisonPolicy(questionType, periodType) {
  const allowed = new Set(['NONE']);
  if (['PERFORMANCE','CHANGE','COMPARISON','EXPLANATION','RISK','OPPORTUNITY','ACTION'].includes(questionType)) ['YOY','PREVIOUS_PERIOD'].forEach(v=>allowed.add(v));
  if (periodType === 'CURRENT_MTD') allowed.add('SAME_CUTOFF_YOY');
  if (['PERFORMANCE','EXPECTATION','EXPLANATION','RISK','OPPORTUNITY','ACTION'].includes(questionType)) allowed.add('EXPECTED');
  if (['PERFORMANCE','COMPARISON','OPPORTUNITY','RISK'].includes(questionType)) ['PEERS','MARKET'].forEach(v=>allowed.add(v));
  let defaultValue='NONE';
  if (questionType==='EXPECTATION' && periodType==='CURRENT_MTD') defaultValue='EXPECTED';
  else if (questionType==='PERFORMANCE') defaultValue=periodType==='CURRENT_MTD'?'SAME_CUTOFF_YOY':'YOY';
  else if (questionType==='CHANGE') defaultValue='PREVIOUS_PERIOD';
  else if (questionType==='EXPLANATION') defaultValue='PREVIOUS_PERIOD';
  else if (questionType==='RISK') defaultValue=periodType==='CURRENT_MTD'?'SAME_CUTOFF_YOY':'YOY';
  return { allowed:[...allowed], defaultValue };
}
function scopePolicy(entityType) {
  if (entityType==='STORE' || entityType==='SELLER') return { allowed:{organization_scope:['CIDEF','ALL'],commercial_universe:['OWN_STORES']}, defaults:{organization_scope:null,commercial_universe:'OWN_STORES'} };
  if (entityType==='COMPANY') return { allowed:{organization_scope:['CIDEF','ALL'],commercial_universe:['COMPANY','OWN_STORES','DEALERS']}, defaults:{organization_scope:null,commercial_universe:'COMPANY'} };
  return { allowed:{organization_scope:['CIDEF','INDUMOTORA','MACO_TATTERSALL','ALL'],commercial_universe:['COMPANY','OWN_STORES','DEALERS']}, defaults:{organization_scope:null,commercial_universe:null} };
}

export async function resolveSemanticParse(request={}, options={}) {
  if (typeof request.question !== 'string' || !request.question.trim()) throw Object.assign(new Error('QUESTION_REQUIRED'),{code:'QUESTION_REQUIRED'});
  const parsed = validateSemanticParse(request.semantic_parse);
  const temporal = deriveTemporalMetadata(parsed.period, { now:options.now, timezone:options.timezone ?? CIDEF_TIMEZONE });
  const entityResolver = options.entityResolver ?? resolveCanonicalEntity;
  const entity = parsed.entity ? await entityResolver(parsed.entity, options) : {status:'MISSING',resolved:false};
  const availability = await resolveAvailability(temporal, { provider:options.availabilityProvider, sql:options.sql });
  const comparison = comparisonPolicy(parsed.question_type, temporal.type);
  const scope = scopePolicy(parsed.entity?.type ?? null);
  const missing=[];
  if (!parsed.entity) missing.push({field:'entity',kind:'MISSING_REQUIRES_USER'});
  else if (entity.status==='AMBIGUOUS') missing.push({field:'entity',kind:'MISSING_REQUIRES_USER'});
  else if (!entity.resolved) missing.push({field:'entity',kind:entity.status==='UNSUPPORTED'?'UNSUPPORTED':'MISSING_REQUIRES_USER'});
  if (parsed.comparison && !comparison.allowed.includes(parsed.comparison)) missing.push({field:'comparison',kind:'UNSUPPORTED'});
  if (parsed.scope?.organization_scope && !scope.allowed.organization_scope.includes(parsed.scope.organization_scope)) missing.push({field:'scope.organization_scope',kind:'UNSUPPORTED'});
  if (parsed.scope?.commercial_universe && !scope.allowed.commercial_universe.includes(parsed.scope.commercial_universe)) missing.push({field:'scope.commercial_universe',kind:'UNSUPPORTED'});
  if (parsed.comparison==null && comparison.defaultValue) missing.push({field:'comparison',kind:'MISSING_BUT_DEFAULTABLE'});
  if (parsed.depth==null) missing.push({field:'depth',kind:'MISSING_BUT_DEFAULTABLE'});
  const hardMissing=missing.filter(x=>x.kind!=='MISSING_BUT_DEFAULTABLE');
  const ready=hardMissing.length===0;
  const defaults={ comparison: parsed.comparison?null:{value:comparison.defaultValue,reason_code:'QUESTION_TYPE_PERIOD_DEFAULT'}, depth: parsed.depth?null:{value:'STANDARD',reason_code:'STANDARD_DEPTH_DEFAULT'}, scope:scope.defaults };
  const authority={
    ready,
    semantic_parse:parsed,
    entity: entity.resolved ? { type:parsed.entity.type, display_name:entity.display_name, canonical_id:entity.canonical_id } : null,
    period:{ ...temporal },
    allowed:{ comparison:comparison.allowed, depth:DEPTHS, scope:scope.allowed },
    defaults,
  };
  const resolution_id=issueResolutionToken(authority,{secret:options.tokenSecret,nowMs:options.nowMs,ttlMs:options.ttlMs});
  return {
    version:CONTRACT_VERSIONS.resolution_bundle,
    resolution_id,
    question:request.question,
    understood:{ question_type:parsed.question_type, entity:parsed.entity, period:parsed.period, comparison:parsed.comparison, scope:parsed.scope, depth:parsed.depth },
    resolved:{ entity: entity.resolved?{resolved:true,type:parsed.entity.type,display_name:entity.display_name,resolution_status:entity.status}:{resolved:false,resolution_status:entity.status}, period:{resolved:true,type:temporal.type,date_from:temporal.date_from,date_to:temporal.date_to,status:temporal.period_status,cutoff_mode:temporal.cutoff_mode,timezone:temporal.timezone}, scope:{organization_scope:parsed.scope?.organization_scope??null,commercial_universe:parsed.scope?.commercial_universe??null} },
    availability,
    ambiguity:{ status:ready?'RESOLVED':'NEEDS_REFINEMENT', fields:hardMissing.map(x=>x.field) },
    allowed:{ comparison:comparison.allowed, depth:DEPTHS, scope:scope.allowed },
    defaults,
    missing,
    ready,
  };
}
