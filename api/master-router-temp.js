import { refreshProductAliasesV01 } from '../lib/master/product-aliases-v01.js';

const OPERATIONS = {
  refresh_producto_aliases_v01: refreshProductAliasesV01,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  const operation = req.body?.operation;
  const run = OPERATIONS[operation];
  if (!run) {
    return res.status(400).json({
      ok: false,
      error: 'Unknown operation',
      allowedOperations: Object.keys(OPERATIONS),
    });
  }

  try {
    const result = await run();
    return res.status(200).json({
      ok: true,
      router: 'master-router-temp',
      operation,
      result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, operation, error: error.message });
  }
}
