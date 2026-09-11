import { run } from '../lib/motors/commercial-operation-master-v01.js';

const BOOTSTRAP_TOKEN = '7tn0_CPI_lntlcPfYxUUtGrtk0KuCOO0lFhZzQ5uA1w';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET required' });
  if (req.query?.token !== BOOTSTRAP_TOKEN) return res.status(403).json({ ok: false, error: 'Forbidden' });
  try {
    const result = await run();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message, validation: error.validation ?? null });
  }
}
