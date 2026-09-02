import { parseFechaFactura } from '../motors/ventas-monthly-dedup-sensitivity-v01.js';
import {
  compareStableId,
  normalizedVin,
  recognizedSale,
  stableId,
} from '../ventas/ventasContextUtils.js';
import { monthDays } from './monthRange.js';

function bounds(startMonth, endMonth) {
  return {
    start: Date.parse(`${startMonth}-01T00:00:00.000Z`),
    end: Date.parse(`${endMonth}-${monthDays(endMonth)}T23:59:59.999Z`),
  };
}

function candidate(row, parsed, vin) {
  return {
    time: parsed.date.getTime(),
    stable_id: stableId(row.id),
    sale: recognizedSale(row, parsed, 'vin_last_fecha_factura', vin),
    count: 1,
  };
}

export function buildRecognitionEvents(rows, startMonth, endMonth) {
  const { start, end } = bounds(startMonth, endMonth);
  const byVin = new Map();
  const events = [];

  for (const row of rows || []) {
    const parsed = parseFechaFactura(row?.fecha_factura);
    if (!parsed || parsed.error) continue;
    const time = parsed.date.getTime();
    if (time < start || time > end) continue;
    const vin = normalizedVin(row?.nro_vin_chasis);

    if (vin == null) {
      events.push({ time, previous: null, next: recognizedSale(row, parsed, 'null_vin_row', null) });
      continue;
    }

    if (!byVin.has(vin)) byVin.set(vin, new Map());
    const byTime = byVin.get(vin);
    const current = byTime.get(time);
    if (!current) byTime.set(time, candidate(row, parsed, vin));
    else {
      current.count += 1;
      if (compareStableId(stableId(row.id), current.stable_id) < 0) {
        const replacement = candidate(row, parsed, vin);
        replacement.count = current.count;
        byTime.set(time, replacement);
      }
    }
  }

  let tieGroups = 0;
  for (const byTime of byVin.values()) {
    const sequence = [...byTime.values()].sort((a, b) => a.time - b.time);
    let previous = null;
    for (const item of sequence) {
      if (item.count > 1) tieGroups += 1;
      events.push({ time: item.time, previous, next: item.sale });
      previous = item.sale;
    }
  }

  events.sort((a, b) => a.time - b.time);
  return { events, tie_groups_resolved: tieGroups };
}
