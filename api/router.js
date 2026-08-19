import { getMotor, listMotors } from '../lib/motors/index.js';

const TENANTS = {
  dealer_analytics: {
    motors: ['table_schema', 'profile_table', 'query_table', 'join_tables'],
  },
  data_loader: {
    motors: ['import_lista_precios'],
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  try {
    const tenantName = req.body?.tenant;
    if (typeof tenantName !== 'string' || !tenantName) {
      return res.status(400).json({ ok: false, error: 'tenant is required' });
    }

    const tenant = TENANTS[tenantName];
    if (!tenant) {
      return res.status(403).json({ ok: false, error: 'Tenant not allowed' });
    }

    const motorName = req.body?.motor;
    if (typeof motorName !== 'string' || !motorName) {
      return res.status(400).json({ ok: false, error: 'motor is required' });
    }

    if (!tenant.motors.includes(motorName)) {
      return res.status(403).json({
        ok: false,
        error: 'Motor not allowed for tenant',
        allowedMotors: tenant.motors,
      });
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
    return res.status(200).json({ ok: true, tenant: tenantName, motor: motorName, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
