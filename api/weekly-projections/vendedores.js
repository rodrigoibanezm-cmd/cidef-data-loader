import { getDb, handleApiError, parsePositiveBigInt } from '../../lib/weekly-projections/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET required' });
  }

  try {
    const sucursalId = parsePositiveBigInt(req.query?.sucursal_id, 'sucursal_id');
    const sql = getDb();
    const rows = await sql.query(`
      SELECT
        p.persona_id::text AS persona_id,
        COALESCE(p.nombre_canonico, p.usuario_canonico) AS nombre
      FROM public.persona_sucursal ps
      JOIN public.personas_master p ON p.persona_id = ps.persona_id
      LEFT JOIN public.persona_estado_comercial pec ON pec.persona_id = p.persona_id
      WHERE ps.sucursal_id = $1::bigint
        AND ps.rol = 'VENDEDOR_TIENDA'
        AND ps.vigente = true
        AND COALESCE(pec.vigente_fuerza_venta, true) = true
      ORDER BY COALESCE(p.nombre_canonico, p.usuario_canonico)
    `, [sucursalId]);

    return res.status(200).json({ ok: true, sucursal_id: sucursalId, vendedores: rows });
  } catch (error) {
    return handleApiError(res, error);
  }
}
