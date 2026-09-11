import { run } from '../lib/motors/import-forum.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET required' });
  try {
    const result = await run({ fileName: 'Base clientes cotizados CIDEF - AGOSTO 2026.xlsx' });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
