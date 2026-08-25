import { getMotor, listMotors } from '../lib/motors/index.js';
import { DEALER_ANALYTICS_MOTORS, isDealerAnalyticsMotor } from '../lib/public-motors.js';

export { DEALER_ANALYTICS_MOTORS } from '../lib/public-motors.js';

const TENANTS = {
  dealer_analytics: {
    motors: DEALER_ANALYTICS_MOTORS,
  },
  data_loader: {
    motors: ['import_lista_precios', 'patch_inventario_modelo'],
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

    const motorAllowed = tenantName === 'dealer_analytics'
      ? isDealerAnalyticsMotor(motorName)
      : tenant.motors.includes(motorName);
    if (!motorAllowed) {
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
