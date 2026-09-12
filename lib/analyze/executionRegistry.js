function previousYear(date){ const [y,m,d]=date.split('-').map(Number); const target=y-1; const last=new Date(Date.UTC(target,m,0)).getUTCDate(); return `${target}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`; }
function grain(entityType){ return ({BRAND:'BRAND',MODEL:'MODEL',STORE:'STORE',SELLER:'SELLER'}[entityType] ?? 'TOTAL'); }
function filters(authority){
  const e=authority.entity; if(!e) return {};
  if(e.type==='BRAND') return { brand:e.display_name };
  if(e.type==='MODEL') return { model:e.display_name };
  if(e.type==='STORE') return { store:e.display_name };
  if(e.type==='SELLER') return { seller:e.display_name };
  return {};
}
function commercialUniverse(plan, authority){ return plan.scope_requirements.commercial_universe || authority.defaults?.scope?.commercial_universe || (['STORE','SELLER'].includes(authority.entity.type)?'OWN_STORES':'COMPANY'); }

export function resolveExecutionRequirement(requirement, plan, authority){
  const p=plan.temporal,e=authority.entity, cu=commercialUniverse(plan,authority), f=filters(authority);
  switch(requirement.type){
    case 'CURRENT_RESULT':
      if(p.type==='CURRENT_MTD' && e.type==='COMPANY') return {domain:'SALES',capability:'CURRENT_MONTH_CLOSE_FORECAST',input:{cutoff_date:p.date_to}};
      return {domain:'LONGITUDINAL',capability:'VENTAS',input:{metric:'VIN_SALES',grain:grain(e.type),filters:f,date_from:p.date_from,date_to:p.date_to,time_grain:'MONTH',commercial_universe:cu}};
    case 'HISTORICAL_REFERENCE':
      return {domain:'LONGITUDINAL',capability:'VENTAS',input:{metric:'VIN_SALES',grain:grain(e.type),filters:f,date_from:previousYear(p.date_from),date_to:p.date_to,time_grain:'MONTH',commercial_universe:cu}};
    case 'MARKET_REFERENCE': {
      const entity=e.type==='BRAND'?{brand:e.display_name}:e.type==='MODEL'?{model:e.display_name}:null;
      if(!entity) return null;
      return {domain:'MARKET',capability:'SHARE_TRAJECTORY',input:{date_from:p.date_from,date_to:p.date_to,time_grain:'MONTH',cutoff_mode:p.cutoff_mode||'FULL_PERIOD',organization_scope:'ALL',entity}};
    }
    case 'CLOSE_EXPECTATION':
      if(p.type!=='CURRENT_MTD') return null;
      return {domain:'SALES',capability:'CURRENT_MONTH_CLOSE_FORECAST',input:{cutoff_date:p.date_to}};
    case 'CHANGE_CONTRIBUTION': {
      const a=p.date_from.slice(0,7),b=p.date_to.slice(0,7); if(a>=b) return null;
      return {domain:'SALES',capability:'STORE_CHANGE_CONTRIBUTION',input:{period_a:a,period_b:b}};
    }
    case 'CRM_CONTEXT_SIGNAL':
      if(cu==='DEALERS') return null;
      return {domain:'CRM',capability:'CONTEXT',input:{commercial_universe:cu,date_from:p.date_from,date_to:p.date_to,date_axis:'ASSIGNED_AT',filters:f}};
    default: return null;
  }
}

export function resolveContextRequirement(contextType, plan, authority){
  const p=plan.temporal, cu=commercialUniverse(plan,authority), f=filters(authority);
  if(contextType==='SALES_CONTEXT') return {key:'sales',execution:{domain:'SALES',capability:'COMMERCIAL_CONTEXT',input:{commercial_universe:cu}}};
  if(contextType==='MARKET_CONTEXT') return {key:'market',execution:{domain:'MARKET',capability:'COMPETITIVE_CONTEXT',input:{}}};
  if(contextType==='CRM_CONTEXT') {
    if(cu==='DEALERS') return {key:'crm',execution:null};
    return {key:'crm',execution:{domain:'CRM',capability:'CONTEXT',input:{commercial_universe:cu,date_from:p.date_from,date_to:p.date_to,date_axis:'ASSIGNED_AT',filters:f}}};
  }
  return {key:String(contextType).toLowerCase(),execution:null};
}

export function buildExecutionSteps(plan, authority){
  return plan.evidence_requirements.map((r,index)=>({ step_id:`step_${index+1}`, requirement:r, execution:resolveExecutionRequirement(r,plan,authority) }));
}
export function buildContextSteps(plan, authority){
  return (plan.context_requirements??[]).map((requirement,index)=>({step_id:`context_${index+1}`,requirement,...resolveContextRequirement(requirement.type,plan,authority)}));
}

