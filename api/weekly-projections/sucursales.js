import { getDb, handleApiError } from '../../lib/weekly-projections/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET required' });
  }

  try {
    const sql = getDb();
    const rows = await sql.query(`
      SELECT
        sucursal_id::text AS sucursal_id,
        nombre_canonico,
        sucursal_key
      FROM public.sucursales_master
      WHERE vigente = true
        AND tipo_canal = 'CIDEF'
      ORDER BY nombre_canonico
    `);

    return res.status(200).json({ ok: true, sucursales: rows });
  } catch (error) {
    return handleApiError(res, error);
  }
}
