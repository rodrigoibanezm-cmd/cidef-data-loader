import {
  getDb,
  handleApiError,
  parsePositiveBigInt,
  parsePositiveInt,
  parseWeekStart,
} from '../../lib/weekly-projections/db.js';

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
      wsp.updated_at
    FROM public.weekly_sales_projection wsp
    JOIN public.personas_master p ON p.persona_id = wsp.persona_id
    JOIN public.modelos_master_v01 m ON m.modelo_id = wsp.modelo_id
    JOIN public.marcas_master_v01 ma ON ma.marca_id = m.marca_id
    WHERE wsp.sucursal_id = $1::bigint
      AND wsp.week_start = $2::date
    ORDER BY vendedor, marca, modelo
  `, [sucursalId, weekStart]);

  return res.status(200).json({
    ok: true,
    sucursal_id: sucursalId,
    week_start: weekStart,
    projections: rows,
  });
}

async function saveProjection(req, res) {
  const weekStart = parseWeekStart(req.body?.week_start);
  const sucursalId = parsePositiveBigInt(req.body?.sucursal_id, 'sucursal_id');
  const personaId = parsePositiveBigInt(req.body?.persona_id, 'persona_id');
  const modeloId = parsePositiveBigInt(req.body?.modelo_id, 'modelo_id');
  const projectedUnits = parsePositiveInt(req.body?.projected_units, 'projected_units');
  const sql = getDb();

  const rows = await sql.query(`
    INSERT INTO public.weekly_sales_projection
      (week_start, sucursal_id, persona_id, modelo_id, projected_units, updated_at)
    SELECT
      $1::date,
      $2::bigint,
      $3::bigint,
      $4::bigint,
      $5::integer,
      now()
    WHERE EXISTS (
      SELECT 1
      FROM public.sucursales_master s
      WHERE s.sucursal_id = $2::bigint
        AND s.vigente = true
        AND s.tipo_canal = 'CIDEF'
    )
    AND EXISTS (
      SELECT 1
      FROM public.persona_sucursal ps
      LEFT JOIN public.persona_estado_comercial pec ON pec.persona_id = ps.persona_id
      WHERE ps.persona_id = $3::bigint
        AND ps.sucursal_id = $2::bigint
        AND ps.rol = 'VENDEDOR_TIENDA'
        AND ps.vigente = true
        AND COALESCE(pec.vigente_fuerza_venta, true) = true
    )
    AND EXISTS (
      SELECT 1
      FROM public.producto_portafolio_v01 pp
      WHERE pp.modelo_id = $4::bigint
        AND pp.vigente = true
        AND pp.organizacion = 'CIDEF'
    )
    ON CONFLICT (week_start, sucursal_id, persona_id, modelo_id)
    DO UPDATE SET
      projected_units = EXCLUDED.projected_units,
      updated_at = now()
    RETURNING
      projection_id::text AS projection_id,
      week_start::text AS week_start,
      sucursal_id::text AS sucursal_id,
      persona_id::text AS persona_id,
      modelo_id::text AS modelo_id,
      projected_units,
      updated_at
  `, [weekStart, sucursalId, personaId, modeloId, projectedUnits]);

  if (!rows.length) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid sucursal, seller assignment, or active CIDEF model',
    });
  }

  return res.status(200).json({ ok: true, projection: rows[0] });
}

async function deleteProjection(req, res) {
  const weekStart = parseWeekStart(req.body?.week_start);
  const sucursalId = parsePositiveBigInt(req.body?.sucursal_id, 'sucursal_id');
  const personaId = parsePositiveBigInt(req.body?.persona_id, 'persona_id');
  const modeloId = parsePositiveBigInt(req.body?.modelo_id, 'modelo_id');
  const sql = getDb();

  const rows = await sql.query(`
    DELETE FROM public.weekly_sales_projection
    WHERE week_start = $1::date
      AND sucursal_id = $2::bigint
      AND persona_id = $3::bigint
      AND modelo_id = $4::bigint
    RETURNING projection_id::text AS projection_id
  `, [weekStart, sucursalId, personaId, modeloId]);

  return res.status(200).json({ ok: true, deleted: rows.length === 1 });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await getProjections(req, res);
    if (req.method === 'POST') return await saveProjection(req, res);
    if (req.method === 'DELETE') return await deleteProjection(req, res);

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'GET, POST or DELETE required' });
  } catch (error) {
    return handleApiError(res, error);
  }
}
