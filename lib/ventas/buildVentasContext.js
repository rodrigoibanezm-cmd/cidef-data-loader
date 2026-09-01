import { neon } from '@neondatabase/serverless';
import { parseFechaFactura } from '../motors/ventas-monthly-dedup-sensitivity-v01.js';

export const CONTEXT_NAME = 'ventas_context_v01';
export const CONTEXT_VERSION = '0.1';

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function normalizedText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizedVin(value) {
  return normalizedText(value);
}

function stableId(value) {
  if (value == null) return '';
  return String(value);
}

function compareStableId(a, b) {
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return String(a).localeCompare(String(b));
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function recognizedSale(row, parsed, recognitionBasis, vin) {
  return {
    vin,
    source_id: row.id ?? null,
    fecha_venta: parsed.raw,
    fecha_venta_iso: parsed.date.toISOString(),
    mes_venta: parsed.month,
    recognition_basis: recognitionBasis,
    cliente: normalizedText(row.cliente),
    razon_social: normalizedText(row.razon_social),
    sucursal_id: normalizedText(row.id_sucursal_vta),
    sucursal: normalizedText(row.desc_sucursal_vta),
    vendedor: normalizedText(row.nombre_usuario),
    marca_id: normalizedText(row.id_mae_marca),
    marca: normalizedText(row.desc_mae_marca),
    producto_sku: normalizedText(row.articulo),
    producto: normalizedText(row.desc_articulo),
    nro_operacion: normalizedText(row.nro_operacion),
    nro_propuesta: normalizedText(row.nro_propuesta),
    factura: normalizedText(row.factura),
    nro_factura: normalizedText(row.nro_factura),
    precio_vta: normalizedText(row.precio_vta),
    precio_vta_pesos_con_iva: normalizedText(row.precio_vta_pesos_con_iva),
  };
}

export function calculateVentasContext(rows) {
  const byVin = new Map();
  const nullVinRecognized = [];

  let nonNullVinRows = 0;
  let nullVinRows = 0;
  let parseableFechaRows = 0;
  let nullFechaRows = 0;
  let unparseableFechaRows = 0;
  let unassignableNullVinRows = 0;

  for (const row of rows) {
    const vin = normalizedVin(row.nro_vin_chasis);
    const parsed = parseFechaFactura(row.fecha_factura);

    if (vin == null) {
      nullVinRows += 1;
      if (parsed == null) {
        nullFechaRows += 1;
        unassignableNullVinRows += 1;
        continue;
      }
      if (parsed.error) {
        unparseableFechaRows += 1;
        unassignableNullVinRows += 1;
        continue;
      }
      parseableFechaRows += 1;
      nullVinRecognized.push(recognizedSale(row, parsed, 'null_vin_row', null));
      continue;
    }

    nonNullVinRows += 1;
    if (!byVin.has(vin)) byVin.set(vin, { rows: [], source_count: 0, date_error: false });
    const entry = byVin.get(vin);
    entry.source_count += 1;

    if (parsed == null) {
      nullFechaRows += 1;
      entry.date_error = true;
      continue;
    }
    if (parsed.error) {
      unparseableFechaRows += 1;
      entry.date_error = true;
      continue;
    }

    parseableFechaRows += 1;
    entry.rows.push({ row, parsed, stable_id: stableId(row.id) });
  }

  const recognizedSales = [...nullVinRecognized];
  let excludedVinsWithDateErrors = 0;
  let assignableNonNullVins = 0;
  let vinsSingleOccurrence = 0;
  let vinsMultipleOccurrences = 0;
  let crossMonthVins = 0;
  let exactLastTieVins = 0;

  for (const [vin, entry] of byVin.entries()) {
    if (entry.source_count === 1) vinsSingleOccurrence += 1;
    else vinsMultipleOccurrences += 1;

    if (entry.date_error || !entry.rows.length) {
      excludedVinsWithDateErrors += 1;
      continue;
    }

    assignableNonNullVins += 1;
    const sorted = entry.rows.slice().sort(
      (a, b) => a.parsed.date - b.parsed.date || compareStableId(a.stable_id, b.stable_id),
    );

    const firstMonth = sorted[0].parsed.month;
    const lastTime = sorted[sorted.length - 1].parsed.date.getTime();
    const lastCandidates = sorted
      .filter((item) => item.parsed.date.getTime() === lastTime)
      .sort((a, b) => compareStableId(a.stable_id, b.stable_id));
    const chosenLast = lastCandidates[0];

    if (lastCandidates.length > 1) exactLastTieVins += 1;
    if (firstMonth !== chosenLast.parsed.month) crossMonthVins += 1;

    recognizedSales.push(
      recognizedSale(chosenLast.row, chosenLast.parsed, 'vin_last_fecha_factura', vin),
    );
  }

  recognizedSales.sort((a, b) => {
    const byDate = String(a.fecha_venta_iso).localeCompare(String(b.fecha_venta_iso));
    if (byDate !== 0) return byDate;
    const av = a.vin ?? '';
    const bv = b.vin ?? '';
    const byVinValue = av.localeCompare(bv);
    if (byVinValue !== 0) return byVinValue;
    return compareStableId(a.source_id, b.source_id);
  });

  const monthlyMap = new Map();
  for (const sale of recognizedSales) increment(monthlyMap, sale.mes_venta);
  const monthlySales = [...monthlyMap.entries()]
    .map(([month, sales]) => ({ month, sales }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const recognizedUnits = recognizedSales.length;
  const monthlyUnits = monthlySales.reduce((sum, row) => sum + row.sales, 0);
  const expectedAssignableUnits = assignableNonNullVins + nullVinRecognized.length;

  const warnings = [];
  if (nullFechaRows) warnings.push(`${nullFechaRows} rows have null/blank fecha_factura`);
  if (unparseableFechaRows) warnings.push(`${unparseableFechaRows} rows have unparseable fecha_factura`);
  if (excludedVinsWithDateErrors) {
    warnings.push(`${excludedVinsWithDateErrors} non-null VINs have at least one invalid/missing fecha_factura and were excluded`);
  }
  if (unassignableNullVinRows) {
    warnings.push(`${unassignableNullVinRows} null-VIN rows have invalid/missing fecha_factura and were excluded`);
  }
  if (exactLastTieVins) {
    warnings.push(`${exactLastTieVins} VINs have an exact LAST fecha_factura tie; lowest stable id was used as technical tie-break`);
  }
  if (recognizedUnits !== monthlyUnits || recognizedUnits !== expectedAssignableUnits) {
    warnings.push('Ventas context reconciliation failed');
  }

  return {
    context: CONTEXT_NAME,
    version: CONTEXT_VERSION,
    policy: {
      non_null_vin: 'one recognized sale per VIN using global LAST fecha_factura',
      null_vin: 'one recognized sale per row when fecha_factura is parseable',
      invalid_non_null_vin_date: 'exclude entire VIN when any row has invalid/missing fecha_factura',
      exact_last_tie: 'lowest stable id; technical tie-break only',
      persistence: 'runtime only; no table or materialized layer',
    },
    coverage: {
      source_rows: rows.length,
      parseable_fecha_factura_rows: parseableFechaRows,
      null_fecha_factura_rows: nullFechaRows,
      unparseable_fecha_factura_rows: unparseableFechaRows,
      non_null_vin_rows: nonNullVinRows,
      distinct_non_null_vins: byVin.size,
      null_vin_rows: nullVinRows,
      duplicate_excess_rows: nonNullVinRows - byVin.size,
      assignable_non_null_vins: assignableNonNullVins,
      excluded_vins_with_date_errors: excludedVinsWithDateErrors,
      assignable_null_vin_rows: nullVinRecognized.length,
      unassignable_null_vin_rows: unassignableNullVinRows,
      vins_single_occurrence: vinsSingleOccurrence,
      vins_multiple_occurrences: vinsMultipleOccurrences,
      cross_month_vins: crossMonthVins,
      exact_last_tie_vins: exactLastTieVins,
    },
    recognizedSales,
    monthlySales,
    validation: {
      recognized_units: recognizedUnits,
      monthly_units: monthlyUnits,
      expected_assignable_units: expectedAssignableUnits,
      recognized_matches_monthly: recognizedUnits === monthlyUnits,
      recognized_matches_expected: recognizedUnits === expectedAssignableUnits,
      ok: recognizedUnits === monthlyUnits && recognizedUnits === expectedAssignableUnits,
    },
    warnings,
  };
}

export async function buildVentasContext() {
  const sql = db();
  const rows = await sql.query(`
    SELECT
      id,
      nro_operacion,
      razon_social,
      cliente,
      articulo,
      desc_articulo,
      nro_vin_chasis,
      nombre_usuario,
      fecha_factura,
      precio_vta,
      precio_vta_pesos_con_iva,
      id_sucursal_vta,
      desc_sucursal_vta,
      id_mae_marca,
      desc_mae_marca,
      nro_propuesta,
      factura,
      nro_factura
    FROM ventas_raw
  `);

  return calculateVentasContext(rows);
}
