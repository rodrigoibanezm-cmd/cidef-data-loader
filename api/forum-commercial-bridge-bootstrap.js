import { run } from '../lib/motors/forum-commercial-bridge-v01.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET required' });
  try {
    const result = await run();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
