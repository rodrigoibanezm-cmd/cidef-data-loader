import { CONTRACT_VERSIONS } from '../agent-architecture/contracts.js';
import { QUESTION_FAMILIES, EVIDENCE_REQUIREMENTS } from './semanticPools.js';
export function validateDecisionPlan(plan){
  if(!plan||plan.version!==CONTRACT_VERSIONS.decision_plan) throw Object.assign(new Error('INVALID_DECISION_PLAN_VERSION'),{code:'INVALID_DECISION_PLAN_VERSION'});
  if(!QUESTION_FAMILIES.includes(plan.question_family)) throw Object.assign(new Error('INVALID_QUESTION_FAMILY'),{code:'INVALID_QUESTION_FAMILY'});
  if(!Array.isArray(plan.evidence_requirements)||plan.evidence_requirements.some(x=>!EVIDENCE_REQUIREMENTS.includes(x.type)||!['REQUIRED','OPTIONAL'].includes(x.requirement))) throw Object.assign(new Error('INVALID_EVIDENCE_REQUIREMENTS'),{code:'INVALID_EVIDENCE_REQUIREMENTS'});
  if(!Array.isArray(plan.context_requirements)||plan.context_requirements.some(x=>!x?.type||!['REQUIRED','OPTIONAL'].includes(x.requirement))) throw Object.assign(new Error('INVALID_CONTEXT_REQUIREMENTS'),{code:'INVALID_CONTEXT_REQUIREMENTS'});
  if(!Array.isArray(plan.sufficiency_contract?.required_contexts)) throw Object.assign(new Error('INVALID_SUFFICIENCY_CONTRACT'),{code:'INVALID_SUFFICIENCY_CONTRACT'});
  return plan;
}
