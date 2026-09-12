import { CONTRACT_VERSIONS } from '../agent-architecture/contracts.js';
import { PUBLIC_EVIDENCE_KIND } from '../decide/semanticPools.js';
import { validateDecisionPlan } from '../decide/decisionContracts.js';
import { buildContextSteps, buildExecutionSteps } from './executionRegistry.js';
import { sanitizePublicValue } from './publicSanitizer.js';

async function defaultExecutor(spec){
  const { runCustomGptCapability } = await import('../custom-gpt-router.js');
  return runCustomGptCapability({domain:spec.domain,capability:spec.capability,input:spec.input});
}
function statusSummary(items, required){
  const req=items.filter(x=>required.includes(x._requirement));
  const available=req.filter(x=>x.status==='AVAILABLE').length;
  if(req.length===0) return 'COMPLETE';
  if(available===req.length) return 'COMPLETE';
  if(available>0) return 'PARTIAL';
  return 'INSUFFICIENT';
}
function scopeFor(intent){ return { organization_scope:intent.scope.organization_scope??null, commercial_universe:intent.scope.commercial_universe??null }; }

export async function executeDecisionPlan(plan, authority, intent, options={}){
  validateDecisionPlan(plan);
  const executor=options.executor??defaultExecutor;
  const evidenceSteps=buildExecutionSteps(plan,authority);
  const contextSteps=buildContextSteps(plan,authority);
  const evidence=[]; const limitations=[]; const internalTrace=[]; const context={};
  for(const step of evidenceSteps){
    const kind=PUBLIC_EVIDENCE_KIND[step.requirement.type]??'supporting_evidence';
    if(!step.execution){
      evidence.push({_requirement:step.requirement.type,kind,status:'NOT_EVALUABLE',reason_code:'NO_CERTIFIED_EXECUTION_MAPPING',period:{date_from:plan.temporal.date_from,date_to:plan.temporal.date_to},scope:scopeFor(intent),coverage:{status:'NOT_EVALUABLE'}});
      limitations.push(`${kind.toUpperCase()}_NOT_EVALUABLE`); continue;
    }
    try{
      const raw=await executor(step.execution);
      evidence.push({_requirement:step.requirement.type,kind,status:'AVAILABLE',period:{date_from:plan.temporal.date_from,date_to:plan.temporal.date_to},scope:scopeFor(intent),coverage:{status:'AVAILABLE'},data:sanitizePublicValue(raw)});
      internalTrace.push({step_id:step.step_id,requirement:step.requirement.type,execution:step.execution,status:'AVAILABLE'});
    }catch(error){
      evidence.push({_requirement:step.requirement.type,kind,status:'NOT_EVALUABLE',reason_code:error?.code||'EXECUTION_ERROR',period:{date_from:plan.temporal.date_from,date_to:plan.temporal.date_to},scope:scopeFor(intent),coverage:{status:'NOT_EVALUABLE'}});
      limitations.push(`${kind.toUpperCase()}_NOT_EVALUABLE`);
      internalTrace.push({step_id:step.step_id,requirement:step.requirement.type,execution:step.execution,status:'ERROR',error_code:error?.code||null});
    }
  }
  for(const step of contextSteps){
    if(!step.execution){ context[step.key]={status:'NOT_EVALUABLE',reason_code:'NO_CERTIFIED_CONTEXT_MAPPING'}; limitations.push(`${step.requirement.type}_NOT_EVALUABLE`); continue; }
    try{
      const raw=await executor(step.execution);
      context[step.key]={status:'AVAILABLE',data:sanitizePublicValue(raw)};
      internalTrace.push({step_id:step.step_id,context_type:step.requirement.type,context_requirement:step.requirement.requirement,execution:step.execution,status:'AVAILABLE'});
    }catch(error){
      context[step.key]={status:'NOT_EVALUABLE',reason_code:error?.code||'EXECUTION_ERROR'};
      limitations.push(`${step.requirement.type}_NOT_EVALUABLE`);
      internalTrace.push({step_id:step.step_id,context_type:step.requirement.type,context_requirement:step.requirement.requirement,execution:step.execution,status:'ERROR',error_code:error?.code||null});
    }
  }
  const required=plan.sufficiency_contract.required_evidence;
  let sufficiencyStatus=statusSummary(evidence,required);
  const requiredContexts=plan.sufficiency_contract.required_contexts??[];
  const unavailableRequiredContexts=contextSteps.filter(step=>requiredContexts.includes(step.requirement.type) && context[step.key]?.status!=='AVAILABLE').map(step=>step.key);
  if(unavailableRequiredContexts.length && sufficiencyStatus==='COMPLETE') sufficiencyStatus='PARTIAL';
  const publicEvidence=evidence.map(({_requirement,...item})=>item);
  const answered=publicEvidence.filter(x=>x.status==='AVAILABLE').map(x=>x.kind);
  const unanswered=publicEvidence.filter(x=>x.status!=='AVAILABLE').map(x=>x.kind);
  const drillControl={
    status: sufficiencyStatus==='COMPLETE' ? 'STOPPED_QUESTION_SUFFICIENT' : 'STOPPED_NO_CERTIFIED_TRIGGER',
    allowed_dimensions: plan.drill_policy.allowed_dimensions,
    max_depth: plan.drill_policy.max_depth,
    stop_condition: sufficiencyStatus==='COMPLETE' ? 'QUESTION_SUFFICIENT' : 'NO_ADDITIONAL_MATERIAL_EVIDENCE',
  };
  const bundle={
    version:CONTRACT_VERSIONS.evidence_bundle,
    intent,
    evidence:publicEvidence,
    context,
    comparability:{ status:sufficiencyStatus==='COMPLETE'?'VALID':sufficiencyStatus==='PARTIAL'?'PARTIAL':'NOT_EVALUABLE', mode:intent.comparison, common_cutoff_required:plan.comparability.common_cutoff_required },
    coverage:{ requested:publicEvidence.length, available:answered.length, not_evaluable:unanswered.length },
    limitations:[...new Set(limitations)],
    sufficiency:{ status:sufficiencyStatus, answered, unanswered, reason_codes:sufficiencyStatus==='COMPLETE'?[]:[...(unanswered.length?['REQUIRED_EVIDENCE_NOT_FULLY_EVALUABLE']:[]),...(unavailableRequiredContexts.length?['REQUIRED_CONTEXT_NOT_EVALUABLE']:[])] },
    semantic_provenance:intent.semantic_provenance,
  };
  return options.includePrivateTrace ? {evidence_bundle:bundle,_private:{decision_plan:plan,execution_trace:internalTrace,drill_control:drillControl}} : {evidence_bundle:bundle};
}
