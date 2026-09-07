const OPEN_CRM_STATES = ['Sin Gestion', 'En Gestion', 'Oportunidad'];

export function parseCrmLinkMethod(value) {
  const method = String(value ?? 'NONE').trim().toUpperCase();
  if (!['SUGGESTED', 'MANUAL', 'NONE'].includes(method)) {
    const error = new Error('crm_link_method must be SUGGESTED, MANUAL or NONE');
    error.statusCode = 400;
    throw error;
  }
  return method;
}

export function parseCrmOpportunityId(value, method) {
  const id = String(value ?? '').trim();
  if (method === 'NONE') return null;
  if (!id) {
    const error = new Error('crm_opportunity_id is required for SUGGESTED or MANUAL');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

const resolutionCtes = `
WITH crm_base AS (
  SELECT
    c."ID"::text AS crm_opportunity_id,
    c."Nombre" AS nombre,
    c."Apellido" AS apellido,
    c."Estado" AS estado,
    c."Producto de interes" AS producto_interes,
    c."Creado el" AS creado_el,
    c."Gestionado el" AS gestionado_el,
    c."Asignado a" AS asignado_a,
    c."Sucursal Asignada" AS sucursal_asignada,
    trim(regexp_replace(translate(upper(coalesce(c."Asignado a", '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g')) AS vendedor_norm,
    trim(regexp_replace(translate(upper(coalesce(c."Producto de interes", '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g')) AS producto_norm
  FROM public."CRM_Cidef_raw" c
  JOIN public.sucursal_aliases sa
    ON sa.fuente = 'CRM_Cidef_raw'
   AND sa.validated = true
   AND sa.sucursal_id = $1::bigint
   AND trim(regexp_replace(translate(upper(coalesce(c."Sucursal Asignada", '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g')) = sa.valor_normalizado
  WHERE c."Estado" = ANY($4::text[])
    AND coalesce(c."Producto de interes", '') NOT IN ('', 'N/A')
),
roster AS (
  SELECT DISTINCT ps.persona_id
  FROM public.persona_sucursal ps
  LEFT JOIN public.persona_estado_comercial pec ON pec.persona_id = ps.persona_id
  WHERE ps.sucursal_id = $1::bigint
    AND ps.rol = 'VENDEDOR_TIENDA'
    AND ps.vigente = true
    AND COALESCE(pec.vigente_fuerza_venta, true) = true
),
person_aliases AS (
  SELECT DISTINCT r.persona_id,
    trim(regexp_replace(translate(upper(x.valor), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g')) AS alias_norm
  FROM roster r
  JOIN public.personas_master p ON p.persona_id = r.persona_id
  CROSS JOIN LATERAL (
    SELECT p.nombre_canonico AS valor
    UNION ALL SELECT p.usuario_canonico
    UNION ALL
    SELECT pa.valor_raw
    FROM public.persona_aliases pa
    WHERE pa.persona_id = r.persona_id AND pa.validated = true
  ) x
  WHERE coalesce(x.valor, '') <> ''
),
seller_scores AS (
  SELECT cb.crm_opportunity_id, pa.persona_id,
    (
      SELECT count(*)
      FROM (
        SELECT DISTINCT token FROM unnest(string_to_array(cb.vendedor_norm, ' ')) token WHERE length(token) >= 2
        INTERSECT
        SELECT DISTINCT token FROM unnest(string_to_array(pa.alias_norm, ' ')) token WHERE length(token) >= 2
      ) common
    ) AS token_score
  FROM crm_base cb
  CROSS JOIN person_aliases pa
),
seller_best AS (
  SELECT crm_opportunity_id, persona_id
  FROM (
    SELECT ss.*,
      max(token_score) OVER (PARTITION BY crm_opportunity_id) AS best_score,
      count(*) FILTER (WHERE token_score = max_score) OVER (PARTITION BY crm_opportunity_id) AS dummy
    FROM (
      SELECT ss.*, max(token_score) OVER (PARTITION BY crm_opportunity_id) AS max_score
      FROM seller_scores ss
    ) ss
  ) z
  WHERE token_score = best_score AND best_score >= 2
),
seller_unique AS (
  SELECT crm_opportunity_id, min(persona_id) AS persona_id
  FROM seller_best
  GROUP BY crm_opportunity_id
  HAVING count(DISTINCT persona_id) = 1
),
active_models AS (
  SELECT DISTINCT m.modelo_id, ma.marca_id,
    trim(regexp_replace(translate(upper(ma.nombre_canonico), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g')) AS marca_norm,
    trim(regexp_replace(translate(upper(m.nombre_canonico), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z0-9]+', ' ', 'g')) AS modelo_norm
  FROM public.producto_portafolio_v01 pp
  JOIN public.modelos_master_v01 m ON m.modelo_id = pp.modelo_id
  JOIN public.marcas_master_v01 ma ON ma.marca_id = m.marca_id
  WHERE pp.vigente = true AND pp.organizacion = 'CIDEF'
),
model_candidates AS (
  SELECT cb.crm_opportunity_id, am.modelo_id, length(am.modelo_norm) AS specificity
  FROM crm_base cb
  CROSS JOIN active_models am
  WHERE cb.producto_norm LIKE '%' || am.marca_norm || '%'
    AND cb.producto_norm LIKE '%' || am.modelo_norm || '%'
),
model_ranked AS (
  SELECT mc.*,
    dense_rank() OVER (PARTITION BY crm_opportunity_id ORDER BY specificity DESC) AS rnk
  FROM model_candidates mc
),
model_unique AS (
  SELECT crm_opportunity_id, min(modelo_id) AS modelo_id
  FROM model_ranked
  WHERE rnk = 1
  GROUP BY crm_opportunity_id
  HAVING count(DISTINCT modelo_id) = 1
)
`;

export async function findCompatibleOpportunities(sql, { sucursalId, personaId, modeloId, crmOpportunityId = null }) {
  const rows = await sql.query(`${resolutionCtes}
    SELECT
      cb.crm_opportunity_id,
      concat_ws(' ', nullif(cb.nombre, ''), nullif(cb.apellido, '')) AS cliente,
      cb.producto_interes,
      cb.estado,
      cb.creado_el,
      cb.gestionado_el,
      cb.asignado_a,
      cb.sucursal_asignada
    FROM crm_base cb
    JOIN seller_unique su ON su.crm_opportunity_id = cb.crm_opportunity_id
    JOIN model_unique mu ON mu.crm_opportunity_id = cb.crm_opportunity_id
    WHERE su.persona_id = $2::bigint
      AND mu.modelo_id = $3::bigint
      AND ($5::text IS NULL OR cb.crm_opportunity_id = $5::text)
    ORDER BY cb.crm_opportunity_id DESC
    LIMIT 100
  `, [sucursalId, personaId, modeloId, OPEN_CRM_STATES, crmOpportunityId]);
  return rows;
}

export async function getOpenOpportunityById(sql, crmOpportunityId) {
  const rows = await sql.query(`
    SELECT
      c."ID"::text AS crm_opportunity_id,
      c."Estado" AS estado,
      c."Producto de interes" AS producto_interes,
      c."Asignado a" AS asignado_a,
      c."Sucursal Asignada" AS sucursal_asignada
    FROM public."CRM_Cidef_raw" c
    WHERE c."ID"::text = $1::text
      AND c."Estado" = ANY($2::text[])
    LIMIT 1
  `, [crmOpportunityId, OPEN_CRM_STATES]);
  return rows[0] || null;
}

export async function validateCrmLink(sql, { method, crmOpportunityId, sucursalId, personaId, modeloId }) {
  if (method === 'NONE') return { crmOpportunityId: null, warnings: [] };

  const open = await getOpenOpportunityById(sql, crmOpportunityId);
  if (!open) {
    const error = new Error('CRM opportunity does not exist or is not open');
    error.statusCode = 400;
    throw error;
  }

  const compatible = await findCompatibleOpportunities(sql, {
    sucursalId,
    personaId,
    modeloId,
    crmOpportunityId,
  });

  if (method === 'SUGGESTED' && compatible.length !== 1) {
    const error = new Error('Suggested CRM opportunity does not match sucursal, seller and model');
    error.statusCode = 400;
    throw error;
  }

  const warnings = [];
  if (method === 'MANUAL' && compatible.length !== 1) {
    warnings.push('CRM opportunity is open but does not resolve to the selected sucursal, seller and model');
  }

  return { crmOpportunityId, warnings };
}
