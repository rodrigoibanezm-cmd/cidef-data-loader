import { CONTRACT_VERSIONS } from '../agent-architecture/contracts.js';
import { QUESTION_FAMILIES, EVIDENCE_REQUIREMENTS } from './semanticPools.js';

function sameMembers(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function validateDecisionPlan(plan){
  if(!plan||plan.version!==CONTRACT_VERSIONS.decision_plan) throw Object.assign(new Error('INVALID_DECISION_PLAN_VERSION'),{code:'INVALID_DECISION_PLAN_VERSION'});
  if(!QUESTION_FAMILIES.includes(plan.question_family)) throw Object.assign(new Error('INVALID_QUESTION_FAMILY'),{code:'INVALID_QUESTION_FAMILY'});
  if(!Array.isArray(plan.evidence_requirements)||plan.evidence_requirements.some(x=>!EVIDENCE_REQUIREMENTS.includes(x.type)||!['REQUIRED','OPTIONAL'].includes(x.requirement))) throw Object.assign(new Error('INVALID_EVIDENCE_REQUIREMENTS'),{code:'INVALID_EVIDENCE_REQUIREMENTS'});
  if(!Array.isArray(plan.context_requirements)||plan.context_requirements.some(x=>!x?.type||!['REQUIRED','OPTIONAL'].includes(x.requirement))) throw Object.assign(new Error('INVALID_CONTEXT_REQUIREMENTS'),{code:'INVALID_CONTEXT_REQUIREMENTS'});
  const requiredEvidence=plan.sufficiency_contract?.required_evidence;
  const requiredContexts=plan.sufficiency_contract?.required_contexts;
  const declaredEvidence=plan.evidence_requirements.filter(x=>x.requirement==='REQUIRED').map(x=>x.type);
  const declaredContexts=plan.context_requirements.filter(x=>x.requirement==='REQUIRED').map(x=>x.type);
  if(!Array.isArray(requiredEvidence)||!Array.isArray(requiredContexts)
    || new Set(requiredEvidence).size!==requiredEvidence.length
    || new Set(requiredContexts).size!==requiredContexts.length
    || !sameMembers(requiredEvidence,declaredEvidence)
    || !sameMembers(requiredContexts,declaredContexts)) {
    throw Object.assign(new Error('INVALID_SUFFICIENCY_CONTRACT'),{code:'INVALID_SUFFICIENCY_CONTRACT'});
  }
  return plan;
}
