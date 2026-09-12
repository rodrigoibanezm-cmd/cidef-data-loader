import { CONTRACT_VERSIONS, validateIntent } from '../agent-architecture/contracts.js';
import { validateDecisionPlan } from './decisionContracts.js';

function req(type, requirement='REQUIRED'){ return {type, requirement}; }
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
function requirements(family){
  const map={
    CURRENT_STATUS:[req('CURRENT_RESULT')],
    EXPECTATION_AND_CLOSE:[req('CURRENT_RESULT'),req('CLOSE_EXPECTATION')],
    TEMPORAL_CONSTRUCTION:[req('CURRENT_RESULT'),req('HISTORICAL_REFERENCE')],
    COMMERCIAL_HEALTH:[req('CURRENT_RESULT'),req('HISTORICAL_REFERENCE')],
    COMPETITIVE_PERFORMANCE:[req('CURRENT_RESULT'),req('MARKET_REFERENCE')],
    RESULT_EXPLANATION:[req('CURRENT_RESULT'),req('CHANGE_CONTRIBUTION')],
    FAIR_COMPARISON:[req('CURRENT_RESULT'),req('HISTORICAL_REFERENCE')],
    OPPORTUNITY_ASSESSMENT:[req('CURRENT_RESULT'),req('MARKET_REFERENCE'),req('CRM_CONTEXT_SIGNAL','OPTIONAL')],
    RISK_ASSESSMENT:[req('CURRENT_RESULT'),req('HISTORICAL_REFERENCE'),req('MARKET_REFERENCE','OPTIONAL')],
    ACTION_PRIORITIZATION:[req('CURRENT_RESULT'),req('HISTORICAL_REFERENCE'),req('CRM_CONTEXT_SIGNAL','OPTIONAL')],
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
  const plan={
    version:CONTRACT_VERSIONS.decision_plan,
    question_family:family,
    semantic_contract:{ question_type:intent.question_type, comparison:intent.comparison, depth:intent.depth },
    evidence_requirements:requirements(family),
    context_requirements: family==='COMPETITIVE_PERFORMANCE'?[ctx('MARKET_CONTEXT')]:family==='ACTION_PRIORITIZATION'?[ctx('SALES_CONTEXT'),ctx('CRM_CONTEXT','OPTIONAL')]:[ctx('SALES_CONTEXT','OPTIONAL')],
    comparability:{ mode:intent.comparison, common_cutoff_required:intent.period.type==='CURRENT_MTD' && ['YOY','SAME_CUTOFF_YOY','MARKET'].includes(intent.comparison) },
    scope_requirements:{ organization_scope:intent.scope.organization_scope, commercial_universe:intent.scope.commercial_universe },
    temporal:{ type:intent.period.type, date_from:intent.period.date_from, date_to:intent.period.date_to, cutoff_mode:authority.period.cutoff_mode??null },
    drill_policy:drillPolicy(intent,family),
    sufficiency_contract:{
      required_evidence:requirements(family).filter(x=>x.requirement==='REQUIRED').map(x=>x.type),
      required_contexts:(family==='COMPETITIVE_PERFORMANCE'?[ctx('MARKET_CONTEXT')]:family==='ACTION_PRIORITIZATION'?[ctx('SALES_CONTEXT'),ctx('CRM_CONTEXT','OPTIONAL')]:[ctx('SALES_CONTEXT','OPTIONAL')]).filter(x=>x.requirement==='REQUIRED').map(x=>x.type),
    },
  };
  return validateDecisionPlan(plan);
}
