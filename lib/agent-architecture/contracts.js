export const CONTRACT_VERSIONS = Object.freeze({
  semantic_parse: 'semantic_parse.v1',
  resolution_bundle: 'resolution_bundle.v1',
  intent: 'intent.v1',
  decision_plan: 'decision_plan.v1',
  evidence_bundle: 'evidence_bundle.v1',
});

export const QUESTION_TYPES = Object.freeze(['STATUS','PERFORMANCE','CHANGE','EXPECTATION','EXPLANATION','COMPARISON','OPPORTUNITY','RISK','ACTION']);
export const ENTITY_TYPES = Object.freeze(['COMPANY','STORE','SELLER','BRAND','MODEL']);
export const COMPARISONS = Object.freeze(['NONE','YOY','SAME_CUTOFF_YOY','PREVIOUS_PERIOD','EXPECTED','PEERS','MARKET']);
export const DEPTHS = Object.freeze(['SUMMARY','STANDARD','DEEP']);
export const COMMERCIAL_UNIVERSES = Object.freeze(['COMPANY','OWN_STORES','DEALERS']);
export const ORGANIZATION_SCOPES = Object.freeze(['CIDEF','INDUMOTORA','MACO_TATTERSALL','ALL']);
export const PROVENANCE_VALUES = Object.freeze(['USER_EXPRESSED','LLM_PARSED','BACKEND_RESOLVED','DETERMINISTIC_DEFAULT']);
export const MISSING_KINDS = Object.freeze(['MISSING_BUT_DEFAULTABLE','MISSING_REQUIRES_USER','UNSUPPORTED']);

function fail(code, detail) {
  const e = new Error(detail ? `${code}: ${detail}` : code);
  e.code = code;
  throw e;
}
const upper = (v) => String(v ?? '').trim().toUpperCase();
const text = (v) => String(v ?? '').trim();
function assertClosedObject(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const extra = Object.keys(value).filter((k) => !allowed.includes(k));
  if (extra.length) fail(code, `unsupported fields ${extra.join(',')}`);
}

export function validateSemanticParse(value) {
  assertClosedObject(value, ['version','question_type','entity','period','comparison','scope','depth'], 'INVALID_SEMANTIC_PARSE');
  if (value.version !== CONTRACT_VERSIONS.semantic_parse) fail('INVALID_SEMANTIC_PARSE_VERSION');
  const questionType = upper(value.question_type);
  if (!QUESTION_TYPES.includes(questionType)) fail('INVALID_QUESTION_TYPE', questionType || 'missing');
  let entity = null;
  if (value.entity != null) {
    assertClosedObject(value.entity, ['type','value'], 'INVALID_SEMANTIC_ENTITY');
    const type = upper(value.entity.type);
    if (!ENTITY_TYPES.includes(type)) fail('INVALID_ENTITY_TYPE', type || 'missing');
    const entityValue = text(value.entity.value);
    if (type !== 'COMPANY' && !entityValue) fail('INVALID_ENTITY_VALUE');
    entity = { type, value: type === 'COMPANY' ? (entityValue || 'CIDEF') : entityValue };
  }
  let period = null;
  if (value.period != null) {
    assertClosedObject(value.period, ['expression'], 'INVALID_SEMANTIC_PERIOD');
    const expression = text(value.period.expression);
    if (!expression) fail('INVALID_SEMANTIC_PERIOD', 'expression required');
    period = { expression };
  }
  const comparison = value.comparison == null ? null : upper(value.comparison);
  if (comparison != null && !COMPARISONS.includes(comparison)) fail('INVALID_COMPARISON', comparison);
  let scope = null;
  if (value.scope != null) {
    assertClosedObject(value.scope, ['organization_scope','commercial_universe'], 'INVALID_SEMANTIC_SCOPE');
    const organization_scope = value.scope.organization_scope == null ? null : upper(value.scope.organization_scope);
    const commercial_universe = value.scope.commercial_universe == null ? null : upper(value.scope.commercial_universe);
    if (organization_scope && !ORGANIZATION_SCOPES.includes(organization_scope)) fail('INVALID_ORGANIZATION_SCOPE', organization_scope);
    if (commercial_universe && !COMMERCIAL_UNIVERSES.includes(commercial_universe)) fail('INVALID_COMMERCIAL_UNIVERSE', commercial_universe);
    scope = { organization_scope, commercial_universe };
  }
  const depth = value.depth == null ? null : upper(value.depth);
  if (depth != null && !DEPTHS.includes(depth)) fail('INVALID_DEPTH', depth);
  return { version: CONTRACT_VERSIONS.semantic_parse, question_type: questionType, entity, period, comparison, scope, depth };
}

export function validateIntent(value) {
  assertClosedObject(value, ['version','question_type','entity','period','comparison','scope','depth','semantic_provenance'], 'INVALID_INTENT');
  if (value.version !== CONTRACT_VERSIONS.intent) fail('INVALID_INTENT_VERSION');
  const question_type = upper(value.question_type);
  if (!QUESTION_TYPES.includes(question_type)) fail('INVALID_QUESTION_TYPE', question_type);
  if (!value.entity || !ENTITY_TYPES.includes(upper(value.entity.type)) || !text(value.entity.value)) fail('INVALID_INTENT_ENTITY');
  if (!value.period || typeof value.period !== 'object' || Array.isArray(value.period)) fail('INVALID_INTENT_PERIOD');
  assertClosedObject(value.period, ['type','date_from','date_to'], 'INVALID_INTENT_PERIOD');
  if (!value.period.type || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.period.date_from||'')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.period.date_to||''))) fail('INVALID_INTENT_PERIOD');
  const comparison = upper(value.comparison || 'NONE');
  if (!COMPARISONS.includes(comparison)) fail('INVALID_COMPARISON', comparison);
  const depth = upper(value.depth || 'STANDARD');
  if (!DEPTHS.includes(depth)) fail('INVALID_DEPTH', depth);
  const scope = value.scope ?? {};
  const organization_scope = scope.organization_scope == null ? null : upper(scope.organization_scope);
  const commercial_universe = scope.commercial_universe == null ? null : upper(scope.commercial_universe);
  if (organization_scope && !ORGANIZATION_SCOPES.includes(organization_scope)) fail('INVALID_ORGANIZATION_SCOPE', organization_scope);
  if (commercial_universe && !COMMERCIAL_UNIVERSES.includes(commercial_universe)) fail('INVALID_COMMERCIAL_UNIVERSE', commercial_universe);
  let semantic_provenance = {};
  if (value.semantic_provenance != null) {
    assertClosedObject(value.semantic_provenance, ['question_type','entity','period','comparison','scope','depth'], 'INVALID_SEMANTIC_PROVENANCE');
    semantic_provenance = { ...value.semantic_provenance };
    for (const [field, provenance] of Object.entries(semantic_provenance)) if (!PROVENANCE_VALUES.includes(upper(provenance))) fail('INVALID_SEMANTIC_PROVENANCE', field);
  }
  return {
    version: CONTRACT_VERSIONS.intent,
    question_type,
    entity: { type: upper(value.entity.type), value: text(value.entity.value) },
    period: { ...value.period },
    comparison,
    scope: { organization_scope, commercial_universe },
    depth,
    semantic_provenance,
  };
}

export function publicIntent(intent) {
  const normalized = validateIntent(intent);
  return normalized;
}
