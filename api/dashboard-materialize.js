import { materializeDashboard } from '../lib/dashboard/materializeDashboard.js';
import { getDb, handleApiError } from '../lib/weekly-projections/db.js';

function presentedToken(req) {
  const auth = String(req.headers?.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return String(req.headers?.['x-dashboard-token'] || '');
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ ok: false, error: 'GET or POST required' });
    }
    const expected = process.env.DASHBOARD_REFRESH_TOKEN || process.env.CRON_SECRET || null;
    if (expected && presentedToken(req) !== expected) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    if (!expected) {
      const sql = getDb();
      const rows = await sql.query('SELECT EXISTS (SELECT 1 FROM public.dashboard_company_snapshot_v01) AS exists');
      if (rows[0]?.exists) {
        return res.status(503).json({ ok: false, error: 'DASHBOARD_REFRESH_TOKEN_NOT_CONFIGURED' });
      }
    }
    const result = await materializeDashboard({ requestedDate: req.query?.date || req.body?.date });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(res, error);
  }
}
