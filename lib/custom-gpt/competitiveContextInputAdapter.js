function adapterError(code, detail = null) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function canonicalId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw adapterError('INVALID_MARKET_CONTEXT_ENTITY_ID');
  }
  return id;
}

async function defaultSql() {
  const { customGptDb } = await import('./db.js');
  return customGptDb();
}

export async function adaptCompetitiveContextInput(input = {}, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw adapterError('INVALID_MARKET_CONTEXT_INPUT');
  }
  if (Array.isArray(input.target_model_ids) && input.target_model_ids.length) return input;

  const entity = input.entity;
  const type = String(entity?.type ?? '').toUpperCase();
  if (!['BRAND','MODEL'].includes(type)) {
    throw adapterError('UNSUPPORTED_MARKET_CONTEXT_ENTITY', type || 'missing');
  }
  const id = canonicalId(entity.canonical_id);
  const sql = options.sql ?? await defaultSql();
  const rows = type === 'BRAND'
    ? await sql.query(`SELECT DISTINCT p.modelo_id FROM public.producto_portafolio_v01 p WHERE p.marca_id=$1 AND p.organizacion='CIDEF' AND p.vigente=true ORDER BY p.modelo_id`, [id])
    : await sql.query(`SELECT DISTINCT p.modelo_id FROM public.producto_portafolio_v01 p WHERE p.modelo_id=$1 AND p.organizacion='CIDEF' AND p.vigente=true ORDER BY p.modelo_id`, [id]);
  const targetModelIds = [...new Set(rows.map((row) => Number(row.modelo_id)))]
    .filter((modelId) => Number.isSafeInteger(modelId) && modelId > 0);
  if (!targetModelIds.length) {
    throw adapterError('MARKET_CONTEXT_ENTITY_NOT_IN_PORTFOLIO', `${type}:${id}`);
  }
  const { entity: ignored, ...physicalInput } = input;
  return { ...physicalInput, target_model_ids: targetModelIds };
}
