import { invariant, rejectKeysDeep } from '../primitives.js';
import { DRAFT_FORBIDDEN_FIELDS } from './enums.js';
import { groundTemporalExpression } from './temporal.js';

export function normalizeText(value) {
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[¿?¡!.,:;]/g,' ').replace(/\s+/g,' ').trim();
}
const inferred=(value)=>({status:'BOUND',value,provenance:'LINGUISTICALLY_INFERRED'});
const explicit=(value)=>({status:'BOUND',value,provenance:'USER_EXPLICIT'});

function subjectCandidate(text) {
  if(/\bfoton\b/.test(text))return {status:'AUTHORITY_PENDING',expression:'Foton',type_constraints:['BRAND'],reference_kind:'DIRECT',provenance:'USER_EXPLICIT'};
  if(/\bcidef\b/.test(text))return {status:'AUTHORITY_PENDING',expression:'CIDEF',type_constraints:['COMPANY'],reference_kind:'DIRECT',provenance:'USER_EXPLICIT'};
  if(/\bplaza norte\b/.test(text))return {status:'AUTHORITY_PENDING',expression:'Plaza Norte',type_constraints:['STORE'],reference_kind:'DIRECT',provenance:'USER_EXPLICIT'};
  if(/\b(nosotros|vendimos|nuestras|nuestros|estamos)\b/.test(text))return {status:'AUTHORITY_PENDING',expression:'nosotros',type_constraints:['COMPANY'],reference_kind:'DEICTIC',provenance:'LINGUISTICALLY_INFERRED'};
  return null;
}
function intentCandidate(text) {
  if(/\bpor que\b/.test(text))return {operation:explicit('EXPLAIN'),breadth:inferred('FOCUSED'),concepts:inferred(['CHANGE_CONTRIBUTION']),causality:'NOT_AUTHORIZED'};
  if(/\bcuanto(?:s)?\s+(?:vin\s+)?vend/.test(text))return {operation:explicit('OBSERVE'),breadth:inferred('FOCUSED'),concepts:inferred(['RESULT']),causality:'NOT_REQUESTED'};
  if(/\bfrente al mercado\b/.test(text))return {operation:explicit('COMPARE'),breadth:inferred('FOCUSED'),concepts:inferred(['RELATIVE_REFERENCE','MARKET_POSITION']),causality:'NOT_REQUESTED'};
  if(/\brespecto de lo esperado\b/.test(text))return {operation:explicit('COMPARE'),breadth:inferred('FOCUSED'),concepts:inferred(['EXPECTATION']),causality:'NOT_REQUESTED'};
  if(/\b(comparalo|compara|comparar)\b/.test(text))return {operation:explicit('COMPARE'),breadth:inferred('FOCUSED'),concepts:inferred(['RELATIVE_REFERENCE']),causality:'NOT_REQUESTED'};
  if(/\bhay riesgo\b/.test(text))return {operation:explicit('ASSESS'),breadth:inferred('FOCUSED'),concepts:inferred(['RISK']),causality:'NOT_REQUESTED'};
  if(/\b(como va|como estamos)\b/.test(text))return {operation:explicit('ASSESS'),breadth:inferred('BROAD'),concepts:inferred(['SIGNAL']),causality:'NOT_REQUESTED'};
  if(/\b(que esta pasando|hay algun problema|que deberia mirar)\b/.test(text))return {operation:explicit('ASSESS'),breadth:inferred('BROAD'),concepts:inferred(['SIGNAL']),causality:'NOT_REQUESTED'};
  return null;
}
function comparisonCandidate(text) {
  if(/\bfrente al mercado\b/.test(text))return {status:'BOUND',relation:'MARKET',reference_expression:'mercado',provenance:'USER_EXPLICIT'};
  if(/\brespecto de lo esperado\b/.test(text))return {status:'BOUND',relation:'EXPECTED',reference_expression:'lo esperado',provenance:'USER_EXPLICIT'};
  if(/\b(mismo periodo (?:del )?ano anterior|ano pasado)\b/.test(text))return {status:'BOUND',relation:'YOY',reference_expression:'mismo período año anterior',provenance:'USER_EXPLICIT'};
  if(/\bcomparalo solo con agosto pasado\b/.test(text))return {status:'BOUND',relation:'PREVIOUS_PERIOD',reference_expression:'agosto pasado',provenance:'USER_EXPLICIT'};
  return null;
}
function constraints(text) {
  const result=[]; const add=(target_axis,operator,value)=>result.push({constraint_id:`constraint_${result.length+1}`,target_axis,operator,value,provenance:'USER_EXPLICIT'});
  if(/\bsolo (?:en )?tiendas propias\b/.test(text))add('COMMERCIAL_UNIVERSE','ALLOW_ONLY','OWN_STORES');
  if(/\bsin mercado\b/.test(text))add('SEMANTIC_CONCEPT','EXCLUDE','MARKET_POSITION');
  if(/\b(no proyectes|sin proyectar)\b/.test(text))add('SEMANTIC_CONCEPT','FORBID','PROJECTED_RESULT');
  if(/\bcomparalo solo con agosto pasado\b/.test(text))add('COMPARISON','ALLOW_ONLY','PREVIOUS_PERIOD');
  if(/\bpor que\b/.test(text))add('SEMANTIC_CONCEPT','FORBID','CAUSAL_CLAIM');
  return result;
}

export function isContextDependentUtterance(question) {
  const text=normalizeText(question);
  return /^(y\b|comparalo\b|lo\b|eso\b|ultimo\b|ultimos\b|solo\b|sin\b|no proyectes\b)/.test(text);
}

export function groundLexicalCandidate(question,{now,timezone}={}) {
  invariant(typeof question==='string'&&question.trim(),'QUESTION_REQUIRED','$.question'); const text=normalizeText(question);
  const intent=intentCandidate(text); const temporal=groundTemporalExpression(question,{now,timezone}); const subject=subjectCandidate(text); const comparison=comparisonCandidate(text); const explicitConstraints=constraints(text);
  const scope={};
  if(explicitConstraints.some((item)=>item.target_axis==='COMMERCIAL_UNIVERSE'&&item.value==='OWN_STORES'))scope.commercial_universe=explicit('OWN_STORES');
  if(explicitConstraints.some((item)=>item.value==='MARKET_POSITION'))scope.market_universe={status:'OMITTED',provenance:'USER_EXPLICIT'};
  const candidate={
    subject, temporal, scope, comparison,
    operation:intent?.operation??null, breadth:intent?.breadth??null, concepts:intent?.concepts??null,
    causality:intent?.causality??'NOT_REQUESTED', explicit_conjunction:/\s+y\s+/.test(text),
    explicit_constraints:explicitConstraints,
  };
  rejectKeysDeep(candidate,DRAFT_FORBIDDEN_FIELDS,'$'); return candidate;
}

export function validateExternalSemanticCandidate(candidate) {
  invariant(candidate&&typeof candidate==='object'&&!Array.isArray(candidate),'INVALID_SEMANTIC_CANDIDATE','$'); rejectKeysDeep(candidate,DRAFT_FORBIDDEN_FIELDS,'$'); return candidate;
}
