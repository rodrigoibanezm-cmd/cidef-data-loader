import { refreshProductAliasesV01 } from '../lib/master/product-aliases-v01.js';
import {
  refreshProductAliasesV02,
  refreshProductAliasesV02Ventas,
  refreshProductAliasesV02Notas,
  refreshProductAliasesV02Vehiculos,
  refreshProductAliasesV02Summary,
} from '../lib/master/product-aliases-v02.js';
import {
  refreshProductAliasesFinal,
  refreshProductAliasesFinalReset,
  refreshProductAliasesFinalExact,
  refreshProductAliasesFinalVin,
  refreshProductAliasesFinalSummary,
} from '../lib/master/product-aliases-final.js';

const OPERATIONS = {
  refresh_producto_aliases_v01: refreshProductAliasesV01,
  refresh_producto_aliases_v02: refreshProductAliasesV02,
  refresh_producto_aliases_v02_ventas: refreshProductAliasesV02Ventas,
  refresh_producto_aliases_v02_notas: refreshProductAliasesV02Notas,
  refresh_producto_aliases_v02_vehiculos: refreshProductAliasesV02Vehiculos,
  refresh_producto_aliases_v02_summary: refreshProductAliasesV02Summary,
  refresh_producto_aliases_final: refreshProductAliasesFinal,
  refresh_producto_aliases_final_reset: refreshProductAliasesFinalReset,
  refresh_producto_aliases_final_exact: refreshProductAliasesFinalExact,
  refresh_producto_aliases_final_vin: refreshProductAliasesFinalVin,
  refresh_producto_aliases_final_summary: refreshProductAliasesFinalSummary,
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
