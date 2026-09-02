function addFilter(parts, params, expression, value) {
  if (value === null) return;
  params.push(value);
  parts.push(`${expression} = $${params.length}`);
}

export function buildVersionGenerationQuery(scope) {
  const filters = [];
  const params = [];
  addFilter(filters, params, 'v.modelo_id', scope.modeloId);
  addFilter(filters, params, 'v.version_id', scope.versionId);
  addFilter(filters, params, 'vg.generation_id', scope.generationId);
  addFilter(filters, params, 'vg.status', scope.membershipStatus);
  params.push(scope.limit);

  return {
    sql: `
      SELECT
        v.version_id,
        v.modelo_id,
        m.nombre_canonico AS modelo,
        v.nombre_canonico AS version,
        vg.generation_id,
        vg.status AS membership_status,
        g.nombre_canonico AS generation,
        g.nombre_normalizado AS generation_normalized
      FROM versiones_master_v01 v
      JOIN modelos_master_v01 m ON m.modelo_id=v.modelo_id
      LEFT JOIN version_generation_v01 vg ON vg.version_id=v.version_id
      LEFT JOIN generaciones_master_v01 g ON g.generation_id=vg.generation_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      ORDER BY v.modelo_id, v.version_id
      LIMIT $${params.length}
    `,
    params,
  };
}

export function buildGenerationsQuery(scope) {
  const filters = [];
  const params = [];
  addFilter(filters, params, 'g.model_id', scope.modeloId);
  addFilter(filters, params, 'g.generation_id', scope.generationId);
  if (scope.versionId !== null) {
    params.push(scope.versionId);
    filters.push(`EXISTS (
      SELECT 1 FROM version_generation_v01 vg
      WHERE vg.generation_id=g.generation_id AND vg.version_id=$${params.length}
    )`);
  }
  params.push(scope.limit);

  return {
    sql: `
      SELECT
        g.generation_id,
        g.model_id AS modelo_id,
        m.nombre_canonico AS modelo,
        g.nombre_canonico AS generation,
        g.nombre_normalizado,
        count(vg.version_id)::bigint AS linked_versions
      FROM generaciones_master_v01 g
      JOIN modelos_master_v01 m ON m.modelo_id=g.model_id
      LEFT JOIN version_generation_v01 vg ON vg.generation_id=g.generation_id
      ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
      GROUP BY g.generation_id, g.model_id, m.nombre_canonico,
               g.nombre_canonico, g.nombre_normalizado
      ORDER BY g.model_id, g.generation_id
      LIMIT $${params.length}
    `,
    params,
  };
}
