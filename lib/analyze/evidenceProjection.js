import { previousYearPeriod } from '../intake-orchestrator/temporal.js';

function monthKey(value){ return String(value??'').slice(0,7); }
function enumerateMonths(dateFrom,dateTo){ const out=[]; const cursor=new Date(`${dateFrom.slice(0,7)}-01T00:00:00Z`); const end=monthKey(dateTo); while(cursor.toISOString().slice(0,7)<=end){out.push(cursor.toISOString().slice(0,7));cursor.setUTCMonth(cursor.getUTCMonth()+1);} return out; }
function addYearsMonth(month,delta){const [y,m]=month.split('-').map(Number);return `${y+delta}-${String(m).padStart(2,'0')}`;}
function change(referenceValue,targetValue){ const absolute_change=targetValue-referenceValue; const pct_change=referenceValue===0?null:absolute_change/referenceValue; return {absolute_change,pct_change}; }
function numericSeries(raw){ return Array.isArray(raw?.series)?raw.series.filter(r=>r&&typeof r.period==='string'&&Number.isFinite(Number(r.value))).map(r=>({period:String(r.period),value:Number(r.value)})):[]; }
function relevantCoverage(raw){
 const dimensionCoverage=Array.isArray(raw?.coverage?.dimensionCoverage)?raw.coverage.dimensionCoverage:[];
 const relevant=dimensionCoverage.find(row=>row.dimension===raw.grain)??null;
 return {dimension:relevant,commercial:raw?.commercial_coverage??null,denominator_commercial:raw?.denominator_commercial_coverage??null,commercial_validation:raw?.commercial_validation??null};
}
function notEvaluable(reason, proposition, targetPeriod, referencePeriod, raw){ return {status:'NOT_EVALUABLE',reason_code:reason,evidence:{proposition,comparison:'YOY',target_period:targetPeriod,reference:{type:'SAME_PERIOD_PREVIOUS_YEAR',period:referencePeriod},coverage:relevantCoverage(raw),warnings:Array.isArray(raw?.warnings)?raw.warnings:[]}}; }
function projectComparativeTemporalSupport(requirement, plan, raw){
 const proposition=requirement.proposition; const targetPeriod={date_from:plan.temporal.date_from,date_to:plan.temporal.date_to};
 const referencePeriod=previousYearPeriod({...targetPeriod,cutoff_mode:plan.temporal.cutoff_mode??'FULL_PERIOD'});
 if((plan.temporal.cutoff_mode??'FULL_PERIOD')!=='FULL_PERIOD'||raw?.temporalSemantics?.cutoffMode==='SAME_DAY') return notEvaluable('INCOMPATIBLE_CUTOFF',proposition,targetPeriod,referencePeriod,raw);
 if(raw?.metric!=='VIN_SALES') return notEvaluable('METRIC_MISMATCH',proposition,targetPeriod,referencePeriod,raw);
 const expectedUniverse=plan.scope_requirements?.commercial_universe??null;
 const actualUniverse=raw?.commercial_scope?.universe??raw?.commercial_scope?.commercial_universe??raw?.metadata?.commercialScope??null;
 if(expectedUniverse&&actualUniverse&&expectedUniverse!==actualUniverse) return notEvaluable('COMMERCIAL_UNIVERSE_MISMATCH',proposition,targetPeriod,referencePeriod,raw);
 if(raw?.commercial_validation?.valid===false) return notEvaluable('COMMERCIAL_SCOPE_INVALID',proposition,targetPeriod,referencePeriod,raw);
 if(raw?.temporalSemantics?.lastPeriodComplete===false) return notEvaluable('TARGET_PERIOD_INCOMPLETE',proposition,targetPeriod,referencePeriod,raw);
 const coverage=relevantCoverage(raw); if(coverage.dimension&&(Number(coverage.dimension.unresolved||0)>0||Number(coverage.dimension.ambiguous||0)>0)) return notEvaluable('IDENTITY_COVERAGE_INVALID',proposition,targetPeriod,referencePeriod,raw);
 const rows=numericSeries(raw), byPeriod=new Map(rows.map(r=>[r.period,r.value]));
 const targetMonths=enumerateMonths(targetPeriod.date_from,targetPeriod.date_to), referenceMonths=enumerateMonths(referencePeriod.date_from,referencePeriod.date_to);
 if(targetMonths.length!==referenceMonths.length||targetMonths.some((m,i)=>addYearsMonth(referenceMonths[i],1)!==m)) return notEvaluable('INCOMPATIBLE_TEMPORAL_SHAPE',proposition,targetPeriod,referencePeriod,raw);
 if(targetMonths.some(m=>!byPeriod.has(m))) return notEvaluable('TARGET_PERIOD_DATA_MISSING',proposition,targetPeriod,referencePeriod,raw);
 if(referenceMonths.some(m=>!byPeriod.has(m))) return notEvaluable('REFERENCE_PERIOD_DATA_MISSING',proposition,targetPeriod,referencePeriod,raw);
 const target_value=targetMonths.reduce((sum,m)=>sum+byPeriod.get(m),0), reference_value=referenceMonths.reduce((sum,m)=>sum+byPeriod.get(m),0);
 const aggregate={target_value,reference_value,...change(reference_value,target_value)};
 const evidence={proposition_type:proposition.type,comparison:proposition.comparison,target_period:targetPeriod,reference:{type:proposition.reference.type,period:{date_from:referencePeriod.date_from,date_to:referencePeriod.date_to}},aggregate,coverage,warnings:Array.isArray(raw?.warnings)?raw.warnings:[]};
 if(proposition.evaluation.mode==='AGGREGATE_AND_MONTHLY_SUPPORT'){
   const monthly_support=targetMonths.map((targetMonth,index)=>{const referenceMonth=referenceMonths[index],target=byPeriod.get(targetMonth),reference=byPeriod.get(referenceMonth);return {target_period:targetMonth,reference_period:referenceMonth,target_value:target,reference_value:reference,...change(reference,target)};});
   evidence.monthly_support=monthly_support; evidence.direction_counts={negative_count:monthly_support.filter(x=>x.absolute_change<0).length,positive_count:monthly_support.filter(x=>x.absolute_change>0).length,unchanged_count:monthly_support.filter(x=>x.absolute_change===0).length};
 }
 return {status:'AVAILABLE',evidence};
}
export function projectEvidence({investigation,plan,raw}){
 const requirements=investigation?.requirements??[]; const propositionRequirements=requirements.filter(r=>r.proposition);
 if(!propositionRequirements.length) return {status:'AVAILABLE',evidence:raw};
 const projected=propositionRequirements.map(requirement=>{
   if(requirement.proposition.type==='COMPARATIVE_TEMPORAL_SUPPORT') return projectComparativeTemporalSupport(requirement,plan,raw);
   return {status:'NOT_EVALUABLE',reason_code:'UNSUPPORTED_EVIDENCE_PROPOSITION',evidence:{proposition:requirement.proposition}};
 });
 if(projected.length===1) return projected[0];
 if(projected.some(x=>x.status!=='AVAILABLE')) return {status:'NOT_EVALUABLE',reason_code:'MULTI_REQUIREMENT_PROJECTION_NOT_EVALUABLE',evidence:{items:projected.map(x=>x.evidence)}};
 return {status:'AVAILABLE',evidence:{items:projected.map(x=>x.evidence)}};
}
