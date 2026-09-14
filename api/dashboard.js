import { getDb, handleApiError, parsePositiveBigInt } from '../lib/weekly-projections/db.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'GET required' });
    }
    const sql = getDb();
    const requestedStore = req.query?.sucursal_id
      ? parsePositiveBigInt(req.query.sucursal_id, 'sucursal_id') : null;
    const companyRows = await sql.query(`
      SELECT snapshot_id::text AS snapshot_id, period_month::text AS period_month,
             snapshot_date::text AS snapshot_date, generated_at, contract_version, payload
      FROM public.dashboard_company_snapshot_v01
      WHERE published = true
      ORDER BY snapshot_date DESC, generated_at DESC
      LIMIT 1
    `);
    if (!companyRows.length) {
      return res.status(503).json({ ok: false, error: 'DASHBOARD_SNAPSHOT_NOT_AVAILABLE' });
    }
    const company = companyRows[0];
    const [stores, signals] = await Promise.all([
      sql.query(`
        SELECT dss.sucursal_id::text AS sucursal_id, sm.nombre_canonico AS sucursal, dss.payload
        FROM public.dashboard_store_snapshot_v01 dss
        JOIN public.sucursales_master sm ON sm.sucursal_id = dss.sucursal_id
        WHERE dss.snapshot_id = $1::bigint
          AND ($2::bigint IS NULL OR dss.sucursal_id = $2::bigint)
        ORDER BY sm.nombre_canonico
      `, [company.snapshot_id, requestedStore]),
      sql.query(`
        SELECT signal_id::text AS signal_id, scope_type, scope_id::text AS scope_id,
               signal_type, priority, tone, title, summary,
               impact_value::float AS impact_value, impact_unit, domains,
               evidence_as_of::text AS evidence_as_of, evidence
        FROM public.dashboard_signal_v01
        WHERE snapshot_id = $1::bigint
          AND (scope_type = 'COMPANY' OR ($2::bigint IS NOT NULL AND scope_id = $2::bigint))
        ORDER BY signal_type, priority, signal_id
      `, [company.snapshot_id, requestedStore]),
    ]);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({
      ok: true,
      contract_version: company.contract_version,
      snapshot_id: company.snapshot_id,
      period_month: company.period_month,
      snapshot_date: company.snapshot_date,
      generated_at: company.generated_at,
      company: company.payload,
      stores,
      signals,
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}
