import { parseFechaFactura } from '../motors/ventas-monthly-dedup-sensitivity-v01.js';

function add(counts, unitId, month) {
  const key = String(unitId);
  if (!counts.has(key)) counts.set(key, new Map());
  const months = counts.get(key);
  months.set(month, (months.get(month) ?? 0) + 1);
}

export function indexNvMonths(rows) {
  const counts = new Map();
  const examples = [];
  let parseableRows = 0;
  let unparseableRows = 0;

  for (const row of rows) {
    const parsed = parseFechaFactura(row.fecha_nota_de_venta);
    if (!parsed || parsed.error) {
      unparseableRows += 1;
      if (examples.length < 10) examples.push(parsed?.raw ?? row.fecha_nota_de_venta ?? null);
      continue;
    }
    parseableRows += 1;
    if (row.identity_status === 'RESOLVED') add(counts, row.sucursal_id, parsed.month);
  }

  return {
    counts,
    audit: {
      principal_date: 'fecha_nota_de_venta',
      parseable_rows: parseableRows,
      unparseable_rows: unparseableRows,
      unparseable_examples: examples,
      formats: ['MM/DD/YY H:MI or MM/DD/YYYY H:MI, optional seconds'],
    },
  };
}
