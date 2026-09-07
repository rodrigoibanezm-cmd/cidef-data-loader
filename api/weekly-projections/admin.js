import { getDb, handleApiError, parsePositiveBigInt, parseWeekStart } from '../../lib/weekly-projections/db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'GET required' });
    }

    const weekStart = parseWeekStart(req.query?.week_start);
    const sucursalId = req.query?.sucursal_id
      ? parsePositiveBigInt(req.query.sucursal_id, 'sucursal_id')
      : null;
    const sql = getDb();

    const rows = await sql.query(`
      SELECT
        wsp.projection_id::text AS projection_id,
        wsp.week_start::text AS week_start,
        wsp.sucursal_id::text AS sucursal_id,
        s.nombre_canonico AS sucursal,
        wsp.persona_id::text AS persona_id,
        COALESCE(p.nombre_canonico, p.usuario_canonico, wsp.source_vendedor_raw, 'Sin vendedor') AS vendedor,
        wsp.modelo_id::text AS modelo_id,
        COALESCE(ma.nombre_canonico, wsp.source_brand_raw, 'Sin marca') AS marca,
        COALESCE(m.nombre_canonico, wsp.source_model_raw, 'Sin modelo') AS modelo,
        wsp.projected_units,
        wsp.expected_close_date::text AS expected_close_date,
        wsp.crm_opportunity_id,
        crm.estado AS crm_estado,
        wsp.updated_at
      FROM public.weekly_sales_projection wsp
      JOIN public.sucursales_master s ON s.sucursal_id = wsp.sucursal_id
      LEFT JOIN public.personas_master p ON p.persona_id = wsp.persona_id
      LEFT JOIN public.modelos_master_v01 m ON m.modelo_id = wsp.modelo_id
      LEFT JOIN public.marcas_master_v01 ma ON ma.marca_id = m.marca_id
      LEFT JOIN LATERAL (
        SELECT c."Estado" AS estado
        FROM public."CRM_Cidef_raw" c
        WHERE c."ID" = wsp.crm_opportunity_id
        ORDER BY c.loaded_at DESC NULLS LAST
        LIMIT 1
      ) crm ON wsp.crm_opportunity_id IS NOT NULL
      WHERE wsp.week_start = $1::date
        AND ($2::bigint IS NULL OR wsp.sucursal_id = $2::bigint)
      ORDER BY s.nombre_canonico, vendedor, wsp.expected_close_date, marca, modelo
    `, [weekStart, sucursalId]);

    const summary = rows.reduce((acc, row) => {
      const units = Number(row.projected_units || 0);
      acc.total_units += units;
      acc.rows += 1;
      if (row.crm_opportunity_id) acc.crm_units += units;
      else acc.no_crm_units += units;
      return acc;
    }, { total_units: 0, crm_units: 0, no_crm_units: 0, rows: 0 });

    return res.status(200).json({
      ok: true,
      week_start: weekStart,
      sucursal_id: sucursalId,
      summary,
      projections: rows,
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}
