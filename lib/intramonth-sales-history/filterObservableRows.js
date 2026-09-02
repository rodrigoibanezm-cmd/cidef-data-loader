import { parseFechaFactura } from '../motors/ventas-monthly-dedup-sensitivity-v01.js';

export function filterObservableRows(rows, observableThrough) {
  const maxTime = Date.parse(`${observableThrough}T23:59:59.999Z`);
  return (rows || []).filter((row) => {
    const parsed = parseFechaFactura(row?.fecha_factura);
    return parsed && !parsed.error && parsed.date.getTime() <= maxTime;
  });
}
