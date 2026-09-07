import { getDb, handleApiError } from '../../lib/weekly-projections/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET required' });
  }

  try {
    const sql = getDb();
    const rows = await sql.query(`
      SELECT DISTINCT
        m.modelo_id::text AS modelo_id,
        ma.marca_id::text AS marca_id,
        ma.nombre_canonico AS marca,
        m.nombre_canonico AS modelo
      FROM public.producto_portafolio_v01 pp
      JOIN public.modelos_master_v01 m ON m.modelo_id = pp.modelo_id
      JOIN public.marcas_master_v01 ma ON ma.marca_id = pp.marca_id
      WHERE pp.vigente = true
        AND pp.organizacion = 'CIDEF'
      ORDER BY ma.nombre_canonico, m.nombre_canonico
    `);

    return res.status(200).json({ ok: true, modelos: rows });
  } catch (error) {
    return handleApiError(res, error);
  }
}
