export function rvmModelAliasCtes() {
  return `model_aliases_ranked AS MATERIALIZED (
  SELECT a.*,
    master_norm(a.contexto_marca_raw) AS context_brand_norm,
    master_norm(a.contexto_modelo_raw) AS context_model_norm,
    row_number() OVER (
      PARTITION BY a.valor_normalizado, master_norm(a.contexto_marca_raw), master_norm(a.contexto_modelo_raw)
      ORDER BY CASE a.estado WHEN 'RESUELTO' THEN 1 WHEN 'AMBIGUO' THEN 2 ELSE 3 END, a.alias_id
    ) AS rn
  FROM producto_aliases_v01 a
  WHERE a.nivel='MODELO' AND a.fuente='rvm_raw'
),
model_aliases AS MATERIALIZED (
  SELECT * FROM model_aliases_ranked WHERE rn=1
)`;
}

export function rvmIdentityResolutionCte({ sourceCte = 'rvm_scoped', outputCte = 'identity_resolution' } = {}) {
  return `${outputCte} AS MATERIALIZED (
  SELECT r.*,
    CASE WHEN COALESCE(c.estado,g.estado)='RESUELTO' THEN COALESCE(c.modelo_id,g.modelo_id) END AS model_id,
    CASE WHEN COALESCE(c.estado,g.estado)='RESUELTO' THEN COALESCE(c.marca_id,g.marca_id) END AS brand_id,
    CASE COALESCE(c.estado,g.estado)
      WHEN 'RESUELTO' THEN 'RESUELTO' WHEN 'AMBIGUO' THEN 'AMBIGUO' ELSE 'NO_RESUELTO' END AS identity_status,
    CASE
      WHEN c.alias_id IS NOT NULL AND c.estado='RESUELTO' THEN 'CONTEXTUAL'
      WHEN g.alias_id IS NOT NULL AND g.estado='RESUELTO' THEN 'GENERIC'
      WHEN COALESCE(c.estado,g.estado)='AMBIGUO' THEN 'AMBIGUOUS'
      ELSE 'UNRESOLVED' END AS resolution_method
  FROM ${sourceCte} r
  LEFT JOIN model_aliases c ON c.context_model_norm IS NOT NULL
    AND c.valor_normalizado=r.raw_model_norm AND c.context_brand_norm=r.raw_brand_norm
    AND c.context_model_norm=r.raw_version_norm
  LEFT JOIN model_aliases g ON c.alias_id IS NULL AND g.context_model_norm IS NULL
    AND g.valor_normalizado=r.raw_model_norm AND g.context_brand_norm=r.raw_brand_norm
)`;
}
