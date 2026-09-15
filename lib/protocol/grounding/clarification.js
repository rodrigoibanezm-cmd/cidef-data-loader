import { clone, deepFreeze, invariant } from '../primitives.js';
import {
  createClarificationOption, createClarificationRequest, createQuestionDraft,
  validateClarificationRequest, validateClarificationResponse, validateQuestionDraft,
} from './contracts.js';
import { materializeSemanticPeriod } from './temporal.js';

const clarifiedField=(value)=>({status:'BOUND',value,provenance:'USER_CLARIFIED'});
function option(option_id,label,effect_summary,semantic_patch){return createClarificationOption({option_id,label,effect_summary,semantic_patch});}
function optionsFor(issue,{now,timezone}) {
  const path=issue.field_paths[0];
  if(path==='temporal') return [
    option('period_current_month','Este mes','Use current calendar month',[{path:'temporal',value:{...materializeSemanticPeriod('este mes',{anchor:'CURRENT',quantity:1,unit:'MONTH',closure:'CURRENT',alignment:'CALENDAR'},{now,timezone}),provenance:'USER_CLARIFIED'}}]),
    option('period_last_month','Mes pasado','Use last closed calendar month',[{path:'temporal',value:{...materializeSemanticPeriod('mes pasado',{anchor:'LAST',quantity:1,unit:'MONTH',closure:'CLOSED',alignment:'CALENDAR'},{now,timezone}),provenance:'USER_CLARIFIED'}}]),
    option('period_last_quarter','Último trimestre','Use last closed calendar quarter',[{path:'temporal',value:{...materializeSemanticPeriod('último trimestre',{anchor:'LAST',quantity:1,unit:'QUARTER',closure:'CLOSED',alignment:'CALENDAR'},{now,timezone}),provenance:'USER_CLARIFIED'}}]),
  ];
  if(path==='scope.commercial_universe') return [
    option('universe_company','CIDEF completo','Use complete CIDEF commercial universe',[{path,value:clarifiedField('COMPANY')},{path:'scope.organization_scope',value:clarifiedField('CIDEF')}]),
    option('universe_own_stores','Sólo tiendas propias','Use only CIDEF-owned stores',[{path,value:clarifiedField('OWN_STORES')},{path:'scope.organization_scope',value:clarifiedField('CIDEF')}]),
    option('universe_dealers','Sólo dealers','Use dealer channel only',[{path,value:clarifiedField('DEALERS')},{path:'scope.organization_scope',value:clarifiedField('CIDEF')}]),
  ];
  if(path==='comparison') return [
    option('comparison_yoy','Año anterior','Compare with the same period in the previous year',[{path,value:{status:'BOUND',relation:'YOY',reference_expression:'mismo período año anterior',provenance:'USER_CLARIFIED'}}]),
    option('comparison_previous','Período anterior','Compare with the preceding equivalent period',[{path,value:{status:'BOUND',relation:'PREVIOUS_PERIOD',reference_expression:'período anterior',provenance:'USER_CLARIFIED'}}]),
  ];
  return [];
}
function promptFor(issue) {
  const path=issue.field_paths[0];
  if(path==='subject')return '¿Sobre qué entidad quieres hacer la consulta?';
  if(path==='temporal')return '¿Qué período quieres analizar?';
  if(path==='scope.commercial_universe')return '¿Qué universo comercial quieres analizar?';
  if(path==='scope.organization_scope')return '¿Qué organización quieres analizar?';
  if(path==='comparison')return '¿Contra qué referencia quieres comparar?';
  if(issue.issue_kind==='CONTRADICTORY_CONSTRAINTS')return 'Las restricciones se contradicen. ¿Cuál debe prevalecer?';
  return `Necesito precisar ${path}.`;
}

export function issueClarification({clarification_id,issued_state_version,draft,issue,now,ttl_ms=900000,timezone='America/Santiago'}) {
  validateQuestionDraft(draft); const issued=new Date(now); invariant(Number.isFinite(issued.getTime()),'FROZEN_CLOCK_REQUIRED','$.now'); const options=optionsFor(issue,{now:issued.toISOString(),timezone});
  return createClarificationRequest({
    contract_version:'clarification_request.v1',clarification_id,protocol_id:draft.protocol_id,issued_state_version,
    question_draft_hash:draft.draft_hash,issue_kind:issue.issue_kind,field_paths:issue.field_paths,reason_code:issue.reason_code,
    prompt:promptFor(issue),options,allow_free_text:options.length===0,required:true,
    issued_at:issued.toISOString(),expires_at:new Date(issued.getTime()+ttl_ms).toISOString(),
  });
}

function setPath(target,path,value) {
  const parts=path.split('.'); let cursor=target; for(const part of parts.slice(0,-1)){invariant(cursor&&typeof cursor==='object','INVALID_PATCH_PATH',path);cursor=cursor[part];} cursor[parts.at(-1)]=clone(value);
}
export function applyClarification(draft,request,response,{current_state_version,now,consumed_request_fingerprints=[],free_text_grounder=null}={}) {
  validateQuestionDraft(draft); validateClarificationRequest(request); validateClarificationResponse(response);
  invariant(request.protocol_id===draft.protocol_id&&response.protocol_id===draft.protocol_id,'PROTOCOL_MISMATCH','$');
  invariant(request.question_draft_hash===draft.draft_hash,'STALE_CLARIFICATION_DRAFT','$.question_draft_hash');
  invariant(response.clarification_id===request.clarification_id&&response.request_fingerprint===request.request_fingerprint,'CLARIFICATION_REFERENCE_MISMATCH','$');
  invariant(response.issued_state_version===request.issued_state_version&&current_state_version===request.issued_state_version,'STALE_CLARIFICATION_RESPONSE','$.issued_state_version');
  invariant(new Date(now).toISOString()<=request.expires_at,'CLARIFICATION_EXPIRED','$.expires_at');
  invariant(!consumed_request_fingerprints.includes(request.request_fingerprint),'CLARIFICATION_ALREADY_CONSUMED','$.request_fingerprint');
  let patches;
  if(response.selected_option_id){const selected=request.options.find((item)=>item.option_id===response.selected_option_id);invariant(selected,'UNKNOWN_CLARIFICATION_OPTION','$.selected_option_id');patches=selected.semantic_patch;}
  else {invariant(typeof free_text_grounder==='function','FREE_TEXT_GROUNDER_REQUIRED','$.free_text');patches=free_text_grounder({free_text:response.free_text,field_paths:clone(request.field_paths),draft});invariant(Array.isArray(patches)&&patches.length>0,'FREE_TEXT_NOT_GROUNDED','$.free_text');for(const patch of patches)invariant(request.field_paths.includes(patch.path),'FREE_TEXT_PATCH_OUTSIDE_REQUEST',patch.path);}
  const updated=clone(draft); delete updated.draft_hash;
  for(const patch of patches){const value={...clone(patch.value),provenance:'USER_CLARIFIED'};setPath(updated,patch.path,value);updated.field_provenance[patch.path]='USER_CLARIFIED';}
  updated.grounding_issues=updated.grounding_issues.filter((issue)=>!issue.field_paths.some((path)=>request.field_paths.includes(path)));
  updated.resolved_ambiguity_refs=[...new Set([...updated.resolved_ambiguity_refs,request.request_fingerprint])];
  return deepFreeze({draft:createQuestionDraft(updated),consumed_request_fingerprint:request.request_fingerprint});
}

export class InMemoryClarificationHarness {
  #consumed=new Set();
  apply(draft,request,response,options={}) {
    const result=applyClarification(draft,request,response,{...options,consumed_request_fingerprints:[...this.#consumed]});
    this.#consumed.add(result.consumed_request_fingerprint); return result.draft;
  }
}
