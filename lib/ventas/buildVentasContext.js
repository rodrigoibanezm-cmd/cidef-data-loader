import { neon } from '@neondatabase/serverless';
import { buildMonthlySales } from './buildMonthlySales.js';
import { filterVentasRowsThroughMonth } from './filterVentasRowsThroughMonth.js';
import { resolveVentasRecognition } from './resolveVentasRecognition.js';
import { validateVentasContext } from './validateVentasContext.js';

export const CONTEXT_NAME = 'ventas_context_v01';
export const CONTEXT_VERSION = '0.2';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

const POLICY = Object.freeze({
  non_null_vin: 'one recognized sale per VIN using LAST fecha_factura inside available cutoff',
  null_vin: 'one recognized sale per row when fecha_factura is parseable',
  invalid_non_null_vin_date: 'exclude entire VIN when any included row has invalid/missing fecha_factura',
  exact_last_tie: 'lowest stable id; technical tie-break only',
  persistence: 'runtime only; no table or materialized layer',
});

export function calculateVentasContext(rows, { cutoffMonth = null } = {}) {
  const filtered = filterVentasRowsThroughMonth(rows, cutoffMonth);
  const { recognizedSales, stats } = resolveVentasRecognition(filtered.rows);
  const monthlySales = buildMonthlySales(recognizedSales);
  const { validation, warnings } = validateVentasContext(recognizedSales, monthlySales, stats);

  return {
    context: CONTEXT_NAME,
    version: CONTEXT_VERSION,
    policy: POLICY,
    cutoff_month: cutoffMonth,
    coverage: {
      source_rows: rows.length,
      rows_inside_cutoff: filtered.rows.length,
      rows_excluded_by_cutoff: filtered.excluded,
      ...stats,
    },
    recognizedSales,
    monthlySales,
    validation,
    warnings,
  };
}

export async function buildVentasContext({ cutoffMonth = null } = {}) {
  const sql = db();
  const rows = await sql.query(`
    SELECT
      id, nro_operacion, razon_social, cliente, articulo, desc_articulo,
      nro_vin_chasis, nombre_usuario, fecha_factura, precio_vta,
      precio_vta_pesos_con_iva, id_sucursal_vta, desc_sucursal_vta,
      id_mae_marca, desc_mae_marca, nro_propuesta, factura, nro_factura
    FROM ventas_raw
  `);

  return calculateVentasContext(rows, { cutoffMonth });
}
