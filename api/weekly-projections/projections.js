import {
  getDb,
  handleApiError,
  parseDate,
  parsePositiveBigInt,
  parsePositiveInt,
  parseWeekStart,
} from '../../lib/weekly-projections/db.js';
import {
  parseCrmLinkMethod,
  parseCrmOpportunityId,
  validateCrmLink,
} from '../../lib/weekly-projections/crm.js';

async function getProjections(req, res) {
  const sucursalId = parsePositiveBigInt(req.query?.sucursal_id, 'sucursal_id');
  const weekStart = parseWeekStart(req.query?.week_start);
  const sql = getDb();

  const rows = await sql.query(`
    SELECT
      wsp.projection_id::text AS projection_id,
      wsp.week_start::text AS week_start,
      wsp.sucursal_id::text AS sucursal_id,
      wsp.persona_id::text AS persona_id,
      COALESCE(p.nombre_canonico, p.usuario_canonico) AS vendedor,
      wsp.modelo_id::text AS modelo_id,
      ma.nombre_canonico AS marca,
      m.nombre_canonico AS modelo,
      wsp.projected_units,
      wsp.expected_close_date::text AS expected_close_date,
      wsp.crm_opportunity_id,
      wsp.crm_link_method,
      wsp.updated_at
    FROM public.weekly_sales_projection wsp
    JOIN public.personas_master p ON p.persona_id = wsp.persona_id
    JOIN public.modelos_master_v01 m ON m.modelo_id = wsp.modelo_id
    JOIN public.marcas_master_v01 ma ON ma.marca_id = m.marca_id
    WHERE wsp.sucursal_id = $1::bigint
      AND wsp.week_start = $2::date
    ORDER BY vendedor, expected_close_date, marca, modelo
  `, [sucursalId, weekStart]);

  return res.status(200).json({
    ok: true,
    sucursal_id: sucursalId,
    week_start: weekStart,
    projections: rows,
  });
}

async function validateProjectionDimensions(sql, { sucursalId, personaId, modeloId }) {
  const rows = await sql.query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM public.sucursales_master s
        WHERE s.sucursal_id = $1::bigint
          AND s.vigente = true
          AND s.tipo_canal = 'CIDEF'
      ) AS valid_branch,
      EXISTS (
        SELECT 1
        FROM public.persona_sucursal ps
        LEFT JOIN public.persona_estado_comercial pec ON pec.persona_id = ps.persona_id
        WHERE ps.persona_id = $2::bigint
          AND ps.sucursal_id = $1::bigint
          AND ps.rol = 'VENDEDOR_TIENDA'
          AND ps.vigente = true
          AND COALESCE(pec.vigente_fuerza_venta, true) = true
      ) AS valid_seller,
      EXISTS (
        SELECT 1
        FROM public.producto_portafolio_v01 pp
        WHERE pp.modelo_id = $3::bigint
          AND pp.vigente = true
          AND pp.organizacion = 'CIDEF'
      ) AS valid_model
  `, [sucursalId, personaId, modeloId]);

  const result = rows[0];
  return Boolean(result?.valid_branch && result?.valid_seller && result?.valid_model);
}

async function saveProjection(req, res) {
  const weekStart = parseWeekStart(req.body?.week_start);
  const sucursalId = parsePositiveBigInt(req.body?.sucursal_id, 'sucursal_id');
  const personaId = parsePositiveBigInt(req.body?.persona_id, 'persona_id');
  const modeloId = parsePositiveBigInt(req.body?.modelo_id, 'modelo_id');
  const projectedUnits = parsePositiveInt(req.body?.projected_units, 'projected_units');
  const expectedCloseDate = parseDate(req.body?.expected_close_date, 'expected_close_date');
  const crmLinkMethod = parseCrmLinkMethod(req.body?.crm_link_method);
  const requestedCrmOpportunityId = parseCrmOpportunityId(req.body?.crm_opportunity_id, crmLinkMethod);
  const sql = getDb();

  if (!await validateProjectionDimensions(sql, { sucursalId, personaId, modeloId })) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid sucursal, seller assignment, or active CIDEF model',
    });
  }

  const crmValidation = await validateCrmLink(sql, {
    method: crmLinkMethod,
    crmOpportunityId: requestedCrmOpportunityId,
    sucursalId,
    personaId,
    modeloId,
  });

  const rows = await sql.query(`
    INSERT INTO public.weekly_sales_projection
      (week_start, sucursal_id, persona_id, modelo_id, projected_units,
       expected_close_date, crm_opportunity_id, crm_link_method, updated_at)
    VALUES
      ($1::date, $2::bigint, $3::bigint, $4::bigint, $5::integer,
       $6::date, $7::text, $8::text, now())
    RETURNING
      projection_id::text AS projection_id,
      week_start::text AS week_start,
      sucursal_id::text AS sucursal_id,
      persona_id::text AS persona_id,
      modelo_id::text AS modelo_id,
      projected_units,
      expected_close_date::text AS expected_close_date,
      crm_opportunity_id,
      crm_link_method,
      updated_at
  `, [
    weekStart,
    sucursalId,
    personaId,
    modeloId,
    projectedUnits,
    expectedCloseDate,
    crmValidation.crmOpportunityId,
    crmLinkMethod,
  ]);

  return res.status(201).json({
    ok: true,
    projection: rows[0],
    warnings: crmValidation.warnings,
  });
}

async function updateProjection(req, res) {
  const projectionId = parsePositiveBigInt(req.body?.projection_id, 'projection_id');
  const modeloId = parsePositiveBigInt(req.body?.modelo_id, 'modelo_id');
  const projectedUnits = parsePositiveInt(req.body?.projected_units, 'projected_units');
  const expectedCloseDate = parseDate(req.body?.expected_close_date, 'expected_close_date');
  const crmLinkMethod = parseCrmLinkMethod(req.body?.crm_link_method);
  const requestedCrmOpportunityId = parseCrmOpportunityId(req.body?.crm_opportunity_id, crmLinkMethod);
  const sql = getDb();

  const currentRows = await sql.query(`
    SELECT projection_id, sucursal_id, persona_id
    FROM public.weekly_sales_projection
    WHERE projection_id = $1::bigint
    LIMIT 1
  `, [projectionId]);

  if (!currentRows.length) {
    return res.status(404).json({ ok: false, error: 'Projection not found' });
  }

  const current = currentRows[0];
  const sucursalId = String(current.sucursal_id);
  const personaId = String(current.persona_id);

  if (!await validateProjectionDimensions(sql, { sucursalId, personaId, modeloId })) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid seller assignment or active CIDEF model',
    });
  }

  const crmValidation = await validateCrmLink(sql, {
    method: crmLinkMethod,
    crmOpportunityId: requestedCrmOpportunityId,
    sucursalId,
    personaId,
    modeloId,
  });

  const rows = await sql.query(`
    UPDATE public.weekly_sales_projection
    SET modelo_id = $2::bigint,
        projected_units = $3::integer,
        expected_close_date = $4::date,
        crm_opportunity_id = $5::text,
        crm_link_method = $6::text,
        updated_at = now()
    WHERE projection_id = $1::bigint
    RETURNING
      projection_id::text AS projection_id,
      modelo_id::text AS modelo_id,
      projected_units,
      expected_close_date::text AS expected_close_date,
      crm_opportunity_id,
      crm_link_method,
      updated_at
  `, [
    projectionId,
    modeloId,
    projectedUnits,
    expectedCloseDate,
    crmValidation.crmOpportunityId,
    crmLinkMethod,
  ]);

  return res.status(200).json({
    ok: true,
    projection: rows[0],
    warnings: crmValidation.warnings,
  });
}

async function deleteProjection(req, res) {
  const projectionId = parsePositiveBigInt(req.body?.projection_id, 'projection_id');
  const sql = getDb();

  const rows = await sql.query(`
    DELETE FROM public.weekly_sales_projection
    WHERE projection_id = $1::bigint
    RETURNING projection_id::text AS projection_id
  `, [projectionId]);

  return res.status(200).json({ ok: true, deleted: rows.length === 1 });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await getProjections(req, res);
    if (req.method === 'POST') return await saveProjection(req, res);
    if (req.method === 'PATCH') return await updateProjection(req, res);
    if (req.method === 'DELETE') return await deleteProjection(req, res);

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'GET, POST, PATCH or DELETE required' });
  } catch (error) {
    return handleApiError(res, error);
  }
}
