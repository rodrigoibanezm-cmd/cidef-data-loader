import {
  getDb,
  handleApiError,
  parsePositiveBigInt,
} from '../../lib/weekly-projections/db.js';
import { findCompatibleOpportunities } from '../../lib/weekly-projections/crm.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'GET required' });
    }

    const sucursalId = parsePositiveBigInt(req.query?.sucursal_id, 'sucursal_id');
    const personaId = parsePositiveBigInt(req.query?.persona_id, 'persona_id');
    const modeloId = parsePositiveBigInt(req.query?.modelo_id, 'modelo_id');
    const sql = getDb();

    const opportunities = await findCompatibleOpportunities(sql, {
      sucursalId,
      personaId,
      modeloId,
    });

    return res.status(200).json({
      ok: true,
      sucursal_id: sucursalId,
      persona_id: personaId,
      modelo_id: modeloId,
      opportunities,
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}
