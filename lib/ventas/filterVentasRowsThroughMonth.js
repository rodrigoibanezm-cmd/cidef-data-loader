import { parseFechaFactura } from '../motors/ventas-monthly-dedup-sensitivity-v01.js';
import { shiftMonth } from '../expectation/monthSeries.js';

export function filterVentasRowsThroughMonth(rows, cutoffMonth) {
  if (cutoffMonth == null) return { rows: [...rows], excluded: 0 };
  if (shiftMonth(cutoffMonth, 0) !== cutoffMonth) {
    throw new Error('cutoff_month must use YYYY-MM format');
  }

  const kept = [];
  let excluded = 0;

  for (const row of rows) {
    const parsed = parseFechaFactura(row?.fecha_factura);
    if (parsed && !parsed.error && parsed.month <= cutoffMonth) kept.push(row);
    else excluded += 1;
  }

  return { rows: kept, excluded };
}
