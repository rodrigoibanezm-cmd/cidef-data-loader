import { getMotor, listMotors } from '../lib/motors/index.js';

function authorized(req) {
  const secret = process.env.IMPORT_SECRET;
  if (!secret) throw new Error('Missing IMPORT_SECRET');
  return req.headers['x-import-secret'] === secret;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  try {
    if (!authorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const motorName = req.body?.motor;
    if (typeof motorName !== 'string' || !motorName) {
      return res.status(400).json({ ok: false, error: 'motor is required' });
    }

    const motor = getMotor(motorName);
    if (!motor) {
      return res.status(400).json({
        ok: false,
        error: 'Unknown motor',
        allowedMotors: listMotors(),
      });
    }

    const result = await motor(req.body?.input ?? {});
    return res.status(200).json({ ok: true, motor: motorName, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
