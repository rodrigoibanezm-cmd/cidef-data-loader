const FORBIDDEN_KEYS = new Set(['domain','capability','motor','action','sql','table','dependency','dependencies','dependency_graph','physical_dependency_graph','target_model_ids','universe','universe_name','universe_version','engine','question_family','policy','execution','execution_trace','drill_policy','source_table','source_file']);
function forbidden(key){ return FORBIDDEN_KEYS.has(String(key).toLowerCase()) || /(^|_)(table|motor|capability|action|sql)$/.test(String(key).toLowerCase()) || /(^|_)(canonical_)?(marca|modelo|sucursal|persona|dealer)_ids?$/.test(String(key).toLowerCase()); }
export function sanitizePublicValue(value){
  if(Array.isArray(value)) return value.map(sanitizePublicValue);
  if(!value||typeof value!=='object') return value;
  const out={};
  for(const [key,val] of Object.entries(value)){
    if(forbidden(key)) continue;
    if(key==='commercial_scope' && val && typeof val==='object') {
      out.scope={ commercial_universe: val.universe ?? val.commercial_universe ?? null, organization_scope: val.organization_scope ?? null };
      continue;
    }
    out[key]=sanitizePublicValue(val);
  }
  return out;
}
export function containsForbiddenArchitecture(value){
  const s=JSON.stringify(value).toLowerCase();
  return ['"capability"','"motor"','target_model_ids','"sql"','"question_family"','"dependency_graph"','ventas_universe_v01','rvm_universe_v01','crm_universe_v01','commercial_operation_universe_v01'].some(x=>s.includes(x));
}
