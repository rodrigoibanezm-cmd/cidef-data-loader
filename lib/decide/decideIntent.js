import { CONTRACT_VERSIONS, validateIntent } from '../agent-architecture/contracts.js';
import { validateDecisionPlan } from './decisionContracts.js';

function req(type, requirement='REQUIRED', proposition=null){ return proposition ? {type, requirement, proposition} : {type, requirement}; }
function ctx(type, requirement='REQUIRED'){ return {type, requirement}; }
function familyFor(intent){
  const qt=intent.question_type, et=intent.entity.type;
  if(qt==='STATUS') return 'CURRENT_STATUS';
  if(qt==='EXPECTATION') return 'EXPECTATION_AND_CLOSE';
  if(qt==='CHANGE') return 'TEMPORAL_CONSTRUCTION';
  if(qt==='EXPLANATION') return 'RESULT_EXPLANATION';
  if(qt==='COMPARISON') return 'FAIR_COMPARISON';
  if(qt==='OPPORTUNITY') return 'OPPORTUNITY_ASSESSMENT';
  if(qt==='RISK') return 'RISK_ASSESSMENT';
  if(qt==='ACTION') return 'ACTION_PRIORITIZATION';
  if(qt==='PERFORMANCE' && ['BRAND','MODEL'].includes(et)) return 'COMPETITIVE_PERFORMANCE';
  if(qt==='PERFORMANCE') return 'COMMERCIAL_HEALTH';
  throw Object.assign(new Error('UNSUPPORTED_ANALYTICAL_INTENT'),{code:'UNSUPPORTED_ANALYTICAL_INTENT'});
}

function fullCalendarMonthCount(period){
  const start=String(period?.date_from??''), end=String(period?.date_to??'');
  if(!/^\d{4}-\d{2}-01$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const [sy,sm]=start.split('-').map(Number), [ey,em,ed]=end.split('-').map(Number);
  const last=new Date(Date.UTC(ey,em,0)).getUTCDate();
  if(ed!==last) return null;
  const count=(ey-sy)*12+(em-sm)+1;
  return count>0?count:null;
}
function propositionFor(type, family, intent, authority){
  if(type!=='HISTORICAL_REFERENCE'||family!=='RISK_ASSESSMENT'||intent.comparison!=='YOY') return null;
  if(authority?.period?.period_status!=='CLOSED') return null;
  const months=fullCalendarMonthCount(intent.period);
  if(months==null) return null;
  return {
    type:'COMPARATIVE_TEMPORAL_SUPPORT',
    comparison:'YOY',
    reference:{type:'SAME_PERIOD_PREVIOUS_YEAR'},
    evaluation:{mode:months===1?'AGGREGATE_ONLY':'AGGREGATE_AND_MONTHLY_SUPPORT'},
  };
}
function requirements(family, intent, authority){
  const make=(type, requirement='REQUIRED')=>req(type,requirement,propositionFor(type,family,intent,authority));
  const map={
    CURRENT_STATUS:[make('CURRENT_RESULT')],
    EXPECTATION_AND_CLOSE:[make('CURRENT_RESULT'),make('CLOSE_EXPECTATION')],
    TEMPORAL_CONSTRUCTION:[make('CURRENT_RESULT'),make('HISTORICAL_REFERENCE')],
    COMMERCIAL_HEALTH:[make('CURRENT_RESULT'),make('HISTORICAL_REFERENCE')],
    COMPETITIVE_PERFORMANCE:[make('CURRENT_RESULT'),make('MARKET_REFERENCE')],
    RESULT_EXPLANATION:[make('CURRENT_RESULT'),make('CHANGE_CONTRIBUTION')],
    FAIR_COMPARISON:[make('CURRENT_RESULT'),make('HISTORICAL_REFERENCE')],
    OPPORTUNITY_ASSESSMENT:[make('CURRENT_RESULT'),make('MARKET_REFERENCE'),make('CRM_CONTEXT_SIGNAL','OPTIONAL')],
    RISK_ASSESSMENT:[make('CURRENT_RESULT'),make('HISTORICAL_REFERENCE'),make('MARKET_REFERENCE','OPTIONAL')],
    ACTION_PRIORITIZATION:[make('CURRENT_RESULT'),make('HISTORICAL_REFERENCE'),make('CRM_CONTEXT_SIGNAL','OPTIONAL')],
  }; return map[family] ?? [];
}
function validateCombination(intent,family){
  if(intent.entity.type==='SELLER' && intent.scope.commercial_universe==='DEALERS') throw Object.assign(new Error('INVALID_SEMANTIC_COMBINATION: SELLER/DEALERS'),{code:'INVALID_SEMANTIC_COMBINATION'});
  if(family==='EXPECTATION_AND_CLOSE' && intent.period.type!=='CURRENT_MTD') throw Object.assign(new Error('INVALID_SEMANTIC_COMBINATION: EXPECTATION requires CURRENT_MTD'),{code:'INVALID_SEMANTIC_COMBINATION'});
  if(intent.comparison==='SAME_CUTOFF_YOY' && intent.period.type!=='CURRENT_MTD') throw Object.assign(new Error('INVALID_SEMANTIC_COMBINATION: SAME_CUTOFF_YOY requires CURRENT_MTD'),{code:'INVALID_SEMANTIC_COMBINATION'});
  if(family==='COMPETITIVE_PERFORMANCE' && !['BRAND','MODEL'].includes(intent.entity.type)) throw Object.assign(new Error('INVALID_SEMANTIC_COMBINATION: competitive entity'),{code:'INVALID_SEMANTIC_COMBINATION'});
}
function drillPolicy(intent,family){
  const map={
    CURRENT_STATUS:[], EXPECTATION_AND_CLOSE:[], TEMPORAL_CONSTRUCTION:[], COMMERCIAL_HEALTH:['STORE','BRAND'], COMPETITIVE_PERFORMANCE:['MODEL'], RESULT_EXPLANATION:['STORE','BRAND','SELLER','MODEL'], FAIR_COMPARISON:[], OPPORTUNITY_ASSESSMENT:['STORE','BRAND','MODEL'], RISK_ASSESSMENT:['STORE','BRAND','MODEL'], ACTION_PRIORITIZATION:['STORE','BRAND','SELLER','MODEL'],
  };
  const maxDepth=intent.depth==='DEEP'?3:intent.depth==='STANDARD'?1:0;
  return { allowed_dimensions:map[family]??[], ordering_constraints:['STORE_BEFORE_SELLER'], max_depth:maxDepth, stop_conditions:['QUESTION_SUFFICIENT','NO_ADDITIONAL_MATERIAL_EVIDENCE','UNSUPPORTED_DRILL'] };
}

export function decideIntent(rawIntent, authority){
  const intent=validateIntent(rawIntent);
  if(!authority?.period||!authority?.entity) throw Object.assign(new Error('RESOLUTION_AUTHORITY_REQUIRED'),{code:'RESOLUTION_AUTHORITY_REQUIRED'});
  const family=familyFor(intent); validateCombination(intent,family);
  const evidence=requirements(family,intent,authority);
  const plan={
    version:CONTRACT_VERSIONS.decision_plan,
    question_family:family,
    semantic_contract:{ question_type:intent.question_type, comparison:intent.comparison, depth:intent.depth },
    evidence_requirements:evidence,
    context_requirements: family==='COMPETITIVE_PERFORMANCE'?[ctx('MARKET_CONTEXT')]:family==='ACTION_PRIORITIZATION'?[ctx('SALES_CONTEXT'),ctx('CRM_CONTEXT','OPTIONAL')]:[ctx('SALES_CONTEXT','OPTIONAL')],
    comparability:{ mode:intent.comparison, common_cutoff_required:intent.period.type==='CURRENT_MTD' && ['YOY','SAME_CUTOFF_YOY','MARKET'].includes(intent.comparison) },
    scope_requirements:{ organization_scope:intent.scope.organization_scope, commercial_universe:intent.scope.commercial_universe },
    temporal:{ type:intent.period.type, date_from:intent.period.date_from, date_to:intent.period.date_to, cutoff_mode:authority.period.cutoff_mode??null },
    drill_policy:drillPolicy(intent,family),
    sufficiency_contract:{
      required_evidence:evidence.filter(x=>x.requirement==='REQUIRED').map(x=>x.type),
      required_contexts:(family==='COMPETITIVE_PERFORMANCE'?[ctx('MARKET_CONTEXT')]:family==='ACTION_PRIORITIZATION'?[ctx('SALES_CONTEXT'),ctx('CRM_CONTEXT','OPTIONAL')]:[ctx('SALES_CONTEXT','OPTIONAL')]).filter(x=>x.requirement==='REQUIRED').map(x=>x.type),
    },
  };
  return validateDecisionPlan(plan);
}
