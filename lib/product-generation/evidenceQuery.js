function addFilter(parts, params, expression, value) {
  if (value === null) return;
  params.push(value);
  parts.push(`${expression} = $${params.length}`);
}

export function buildGenerationEvidenceQuery(scope) {
  const filters = [];
  const params = [];
  addFilter(filters, params, 'v.modelo_id', scope.modeloId);
  addFilter(filters, params, 'e.version_id', scope.versionId);
  addFilter(filters, params, 'e.generation_id', scope.generationId);
  params.push(scope.limit);

  return {
    sql: `
      SELECT
        e.evidence_id,
        e.source,
        e.source_external_generation_id,
        e.source_external_modification_id,
        e.generation_id,
        g.model_id AS generation_model_id,
        e.version_id,
        v.modelo_id AS version_model_id,
        e.created_at
      FROM generation_evidence_v01 e
      LEFT JOIN generaciones_master_v01 g ON g.generation_id=e.generation_id
      LEFT JOIN versiones_master_v01 v ON v.version_id=e.version_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY e.evidence_id
      LIMIT $${params.length}
    `,
    params,
  };
}
