import { parseFechaFactura } from '../motors/ventas-monthly-dedup-sensitivity-v01.js';
import {
  compareStableId,
  normalizedVin,
  recognizedSale,
  sortRecognizedSales,
  stableId,
} from './ventasContextUtils.js';

export function resolveVentasRecognition(rows) {
  const byVin = new Map();
  const nullVinRecognized = [];
  const stats = {
    non_null_vin_rows: 0,
    null_vin_rows: 0,
    parseable_fecha_factura_rows: 0,
    null_fecha_factura_rows: 0,
    unparseable_fecha_factura_rows: 0,
    unassignable_null_vin_rows: 0,
    excluded_vins_with_date_errors: 0,
    assignable_non_null_vins: 0,
    vins_single_occurrence: 0,
    vins_multiple_occurrences: 0,
    cross_month_vins: 0,
    exact_last_tie_vins: 0,
  };

  for (const row of rows) {
    const vin = normalizedVin(row.nro_vin_chasis);
    const parsed = parseFechaFactura(row.fecha_factura);

    if (vin == null) {
      stats.null_vin_rows += 1;
      if (parsed == null) {
        stats.null_fecha_factura_rows += 1;
        stats.unassignable_null_vin_rows += 1;
      } else if (parsed.error) {
        stats.unparseable_fecha_factura_rows += 1;
        stats.unassignable_null_vin_rows += 1;
      } else {
        stats.parseable_fecha_factura_rows += 1;
        nullVinRecognized.push(recognizedSale(row, parsed, 'null_vin_row', null));
      }
      continue;
    }

    stats.non_null_vin_rows += 1;
    if (!byVin.has(vin)) byVin.set(vin, { rows: [], source_count: 0, date_error: false });
    const entry = byVin.get(vin);
    entry.source_count += 1;

    if (parsed == null) {
      stats.null_fecha_factura_rows += 1;
      entry.date_error = true;
    } else if (parsed.error) {
      stats.unparseable_fecha_factura_rows += 1;
      entry.date_error = true;
    } else {
      stats.parseable_fecha_factura_rows += 1;
      entry.rows.push({ row, parsed, stable_id: stableId(row.id) });
    }
  }

  const recognizedSales = [...nullVinRecognized];

  for (const [vin, entry] of byVin.entries()) {
    if (entry.source_count === 1) stats.vins_single_occurrence += 1;
    else stats.vins_multiple_occurrences += 1;

    if (entry.date_error || !entry.rows.length) {
      stats.excluded_vins_with_date_errors += 1;
      continue;
    }

    stats.assignable_non_null_vins += 1;
    const sorted = entry.rows.slice().sort(
      (a, b) => a.parsed.date - b.parsed.date || compareStableId(a.stable_id, b.stable_id),
    );
    const firstMonth = sorted[0].parsed.month;
    const lastTime = sorted.at(-1).parsed.date.getTime();
    const lastCandidates = sorted
      .filter((item) => item.parsed.date.getTime() === lastTime)
      .sort((a, b) => compareStableId(a.stable_id, b.stable_id));
    const chosenLast = lastCandidates[0];

    if (lastCandidates.length > 1) stats.exact_last_tie_vins += 1;
    if (firstMonth !== chosenLast.parsed.month) stats.cross_month_vins += 1;
    recognizedSales.push(
      recognizedSale(chosenLast.row, chosenLast.parsed, 'vin_last_fecha_factura', vin),
    );
  }

  return {
    recognizedSales: sortRecognizedSales(recognizedSales),
    stats: {
      ...stats,
      distinct_non_null_vins: byVin.size,
      duplicate_excess_rows: stats.non_null_vin_rows - byVin.size,
      assignable_null_vin_rows: nullVinRecognized.length,
    },
  };
}
