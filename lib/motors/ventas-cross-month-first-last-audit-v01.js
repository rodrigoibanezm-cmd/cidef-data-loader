import { neon } from '@neondatabase/serverless';
import { parseFechaFactura } from './ventas-monthly-dedup-sensitivity-v01.js';

export const ENGINE_NAME = 'ventas_cross_month_first_last_audit_v01';
export const ENGINE_VERSION = '0.1';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ATTRIBUTES = [
  'cliente',
  'razon_social',
  'nro_factura',
  'nro_operacion',
  'desc_tipo_oper',
  'nro_propuesta',
  'desc_sucursal_vta',
  'nombre_usuario',
];
const SPECIAL_CUSTOMERS = ['FK SPA', 'CIDEF S.A.'];
const TOP_LIMIT = 50;
const EXAMPLES_LIMIT = 20;

function db() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('Missing Neon DATABASE_URL');
  return neon(url);
}

function assertMonth(value, name) {
  if (!MONTH_RE.test(String(value || ''))) throw new Error(`${name} must use YYYY-MM`);
  return String(value);
}

function monthOrdinal(month) {
  const [year, m] = month.split('-').map(Number);
  return year * 12 + m - 1;
}

function inWindow(month, startMonth, endMonth) {
  const value = monthOrdinal(month);
  return value >= monthOrdinal(startMonth) && value <= monthOrdinal(endMonth);
}

function normalizedVin(value) {
  if (value == null) return null;
  const vin = String(value).trim();
  return vin === '' ? null : vin;
}

function normalizedText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
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

function numericValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topEntries(map, limit = TOP_LIMIT) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function pairKey(first, last) {
  return `${normalizedText(first) ?? '<NULL>'} → ${normalizedText(last) ?? '<NULL>'}`;
}

function customerMatches(value, target) {
  return normalizedText(value)?.toUpperCase() === target.toUpperCase();
}

export function calculateVentasCrossMonthFirstLastAudit(rows, input = {}) {
  const startMonth = assertMonth(input.start_month, 'start_month');
  const endMonth = assertMonth(input.end_month, 'end_month');
  if (monthOrdinal(endMonth) < monthOrdinal(startMonth)) throw new Error('end_month must be >= start_month');

  const byVin = new Map();
  let sourceRows = 0;
  let nullVinRows = 0;
  let parseErrors = 0;
  let nullFechaRows = 0;

  for (const row of rows) {
    sourceRows += 1;
    const vin = normalizedVin(row.nro_vin_chasis);
    if (!vin) {
      nullVinRows += 1;
      continue;
    }

    const parsed = parseFechaFactura(row.fecha_factura);
    if (parsed == null) {
      nullFechaRows += 1;
      continue;
    }
    if (parsed.error) {
      parseErrors += 1;
      continue;
    }

    const enriched = { ...row, __parsed: parsed, __id: stableId(row.id) };
    if (!byVin.has(vin)) byVin.set(vin, []);
    byVin.get(vin).push(enriched);
  }

  const attributeStats = Object.fromEntries(ATTRIBUTES.map((name) => [name, { same: 0, different: 0 }]));
  const matrices = Object.fromEntries(ATTRIBUTES.map((name) => [name, new Map()]));
  const transferMap = new Map();
  const combinationMap = new Map();
  const specialCustomers = Object.fromEntries(SPECIAL_CUSTOMERS.map((name) => [name, {
    first_only: 0,
    last_only: 0,
    both: 0,
    neither: 0,
    transitions_to_other_customer: 0,
    transitions_from_other_customer: 0,
  }]));
  const customerFirstCounts = new Map();
  const customerLastCounts = new Map();
  const examples = [];

  let universeVins = 0;
  let windowUniverseVins = 0;
  let firstTieVins = 0;
  let lastTieVins = 0;
  let anyExtremeTieVins = 0;
  let priceComparable = 0;
  let priceSame = 0;
  let priceDifferent = 0;
  let priceDeltaAbsSum = 0;
  let priceDeltaPctSum = 0;
  let priceDeltaPctCount = 0;

  for (const [vin, vinRows] of byVin.entries()) {
    if (vinRows.length < 2) continue;
    vinRows.sort((a, b) => a.__parsed.date - b.__parsed.date || compareStableId(a.__id, b.__id));
    const firstDate = vinRows[0].__parsed.date.getTime();
    const lastDate = vinRows[vinRows.length - 1].__parsed.date.getTime();
    const firstMonth = vinRows[0].__parsed.month;
    const lastMonth = vinRows[vinRows.length - 1].__parsed.month;
    if (firstMonth === lastMonth) continue;

    const firstCandidates = vinRows.filter((r) => r.__parsed.date.getTime() === firstDate);
    const lastCandidates = vinRows.filter((r) => r.__parsed.date.getTime() === lastDate);
    const firstTie = firstCandidates.length > 1;
    const lastTie = lastCandidates.length > 1;
    if (firstTie) firstTieVins += 1;
    if (lastTie) lastTieVins += 1;
    if (firstTie || lastTie) anyExtremeTieVins += 1;

    // Stable technical tie-break only; tie incidence is reported separately.
    const first = firstCandidates.slice().sort((a, b) => compareStableId(a.__id, b.__id))[0];
    const last = lastCandidates.slice().sort((a, b) => compareStableId(a.__id, b.__id))[0];

    universeVins += 1;
    if (inWindow(firstMonth, startMonth, endMonth) || inWindow(lastMonth, startMonth, endMonth)) windowUniverseVins += 1;
    increment(transferMap, `${firstMonth}|${lastMonth}`);

    const changedAttributes = [];
    for (const attribute of ATTRIBUTES) {
      const firstValue = normalizedText(first[attribute]);
      const lastValue = normalizedText(last[attribute]);
      if (firstValue === lastValue) attributeStats[attribute].same += 1;
      else {
        attributeStats[attribute].different += 1;
        changedAttributes.push(attribute);
      }
      increment(matrices[attribute], pairKey(firstValue, lastValue));
    }
    increment(combinationMap, changedAttributes.length ? changedAttributes.join('+') : '<NO_CHANGES>');

    const firstCustomer = normalizedText(first.cliente);
    const lastCustomer = normalizedText(last.cliente);
    increment(customerFirstCounts, firstCustomer ?? '<NULL>');
    increment(customerLastCounts, lastCustomer ?? '<NULL>');

    for (const target of SPECIAL_CUSTOMERS) {
      const firstMatch = customerMatches(firstCustomer, target);
      const lastMatch = customerMatches(lastCustomer, target);
      const stats = specialCustomers[target];
      if (firstMatch && lastMatch) stats.both += 1;
      else if (firstMatch) {
        stats.first_only += 1;
        stats.transitions_to_other_customer += 1;
      } else if (lastMatch) {
        stats.last_only += 1;
        stats.transitions_from_other_customer += 1;
      } else stats.neither += 1;
    }

    const firstPrice = numericValue(first.precio_vta_pesos_con_iva ?? first.precio_vta);
    const lastPrice = numericValue(last.precio_vta_pesos_con_iva ?? last.precio_vta);
    if (firstPrice != null && lastPrice != null) {
      priceComparable += 1;
      const deltaAbs = Math.abs(lastPrice - firstPrice);
      if (deltaAbs === 0) priceSame += 1;
      else priceDifferent += 1;
      priceDeltaAbsSum += deltaAbs;
      if (firstPrice !== 0) {
        priceDeltaPctSum += Math.abs(lastPrice / firstPrice - 1);
        priceDeltaPctCount += 1;
      }
    }

    if (examples.length < EXAMPLES_LIMIT && (firstTie || lastTie || changedAttributes.length >= 3)) {
      examples.push({
        vin,
        first: {
          id: first.id ?? null,
          month: firstMonth,
          fecha_factura: first.fecha_factura,
          cliente: first.cliente ?? null,
          razon_social: first.razon_social ?? null,
          nro_factura: first.nro_factura ?? null,
          nro_operacion: first.nro_operacion ?? null,
          nro_propuesta: first.nro_propuesta ?? null,
          desc_sucursal_vta: first.desc_sucursal_vta ?? null,
          nombre_usuario: first.nombre_usuario ?? null,
          precio_vta_pesos_con_iva: first.precio_vta_pesos_con_iva ?? null,
        },
        last: {
          id: last.id ?? null,
          month: lastMonth,
          fecha_factura: last.fecha_factura,
          cliente: last.cliente ?? null,
          razon_social: last.razon_social ?? null,
          nro_factura: last.nro_factura ?? null,
          nro_operacion: last.nro_operacion ?? null,
          nro_propuesta: last.nro_propuesta ?? null,
          desc_sucursal_vta: last.desc_sucursal_vta ?? null,
          nombre_usuario: last.nombre_usuario ?? null,
          precio_vta_pesos_con_iva: last.precio_vta_pesos_con_iva ?? null,
        },
        changed_attributes: changedAttributes,
        first_extreme_tie_rows: firstCandidates.length,
        last_extreme_tie_rows: lastCandidates.length,
      });
    }
  }

  const attributeComparison = Object.fromEntries(ATTRIBUTES.map((attribute) => {
    const stats = attributeStats[attribute];
    return [attribute, {
      ...stats,
      pct_different: universeVins ? stats.different / universeVins : null,
    }];
  }));

  const transitionRows = [...transferMap.entries()]
    .map(([key, vinCount]) => {
      const [fromMonth, toMonth] = key.split('|');
      return { from_month: fromMonth, to_month: toMonth, vin_count: vinCount, pct_universe: universeVins ? vinCount / universeVins : null };
    })
    .sort((a, b) => b.vin_count - a.vin_count || a.from_month.localeCompare(b.from_month) || a.to_month.localeCompare(b.to_month));

  const matrixOutput = Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute,
    topEntries(matrices[attribute]).map(({ key, count }) => ({ transition: key, vin_count: count, pct_universe: universeVins ? count / universeVins : null })),
  ]));

  const warnings = [];
  if (parseErrors) warnings.push(`${parseErrors} non-null VIN rows have unparseable fecha_factura and were excluded`);
  if (nullFechaRows) warnings.push(`${nullFechaRows} non-null VIN rows have null/blank fecha_factura and were excluded`);
  if (anyExtremeTieVins) warnings.push(`${anyExtremeTieVins} cross-month VINs have multiple rows on FIRST and/or LAST extreme date; id is used only as stable technical tie-break`);

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: warnings.length ? 'warning' : 'ok',
    inputs: { start_month: startMonth, end_month: endMonth },
    coverage: {
      source_rows: sourceRows,
      null_vin_rows: nullVinRows,
      parsed_non_null_vins: byVin.size,
      parse_errors: parseErrors,
      null_fecha_factura_rows: nullFechaRows,
      universe_vins: universeVins,
      window_universe_vins: windowUniverseVins,
    },
    tie_audit: {
      first_extreme_tie_vins: firstTieVins,
      last_extreme_tie_vins: lastTieVins,
      any_extreme_tie_vins: anyExtremeTieVins,
      tie_breaker: 'lowest stable id on the exact extreme fecha_factura; technical only, not a business rule',
    },
    month_transfers: transitionRows,
    attribute_comparison: attributeComparison,
    top_attribute_transitions: matrixOutput,
    customer_analysis: {
      special_customers: specialCustomers,
      top_first_customers: topEntries(customerFirstCounts).map(({ key, count }) => ({ customer: key, vin_count: count, pct_universe: universeVins ? count / universeVins : null })),
      top_last_customers: topEntries(customerLastCounts).map(({ key, count }) => ({ customer: key, vin_count: count, pct_universe: universeVins ? count / universeVins : null })),
    },
    price_analysis: {
      comparable_vins: priceComparable,
      same: priceSame,
      different: priceDifferent,
      pct_different: priceComparable ? priceDifferent / priceComparable : null,
      average_absolute_delta: priceComparable ? priceDeltaAbsSum / priceComparable : null,
      average_absolute_pct_delta: priceDeltaPctCount ? priceDeltaPctSum / priceDeltaPctCount : null,
    },
    top_change_combinations: topEntries(combinationMap).map(({ key, count }) => ({ pattern: key, vin_count: count, pct_universe: universeVins ? count / universeVins : null })),
    examples,
    ambiguous_vins: anyExtremeTieVins,
    warnings,
  };
}

export async function ventasCrossMonthFirstLastAuditV01(input = {}) {
  const sql = db();
  const rows = await sql.query(`
    SELECT
      id,
      nro_vin_chasis,
      fecha_factura,
      cliente,
      razon_social,
      nro_factura,
      nro_operacion,
      desc_tipo_oper,
      nro_propuesta,
      desc_sucursal_vta,
      nombre_usuario,
      precio_vta,
      precio_vta_pesos_con_iva
    FROM ventas_raw
  `);
  return calculateVentasCrossMonthFirstLastAudit(rows, input);
}
