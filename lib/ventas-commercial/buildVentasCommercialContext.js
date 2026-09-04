import { customGptDb } from '../custom-gpt/db.js';
import { buildVentasContext } from '../ventas/buildVentasContext.js';

export const COMMERCIAL_UNIVERSES = Object.freeze(['COMPANY', 'OWN_STORES', 'DEALERS']);
const UNIVERSE_SET = new Set(COMMERCIAL_UNIVERSES);

export function parseCommercialUniverse(value, fallback = 'COMPANY') {
  const normalized = String(value ?? fallback).trim().toUpperCase();
  if (!UNIVERSE_SET.has(normalized)) {
    const error = new Error(`INVALID_COMMERCIAL_UNIVERSE: ${value}`);
    error.code = 'INVALID_COMMERCIAL_UNIVERSE';
    throw error;
  }
  return normalized;
}

export async function loadCommercialIdentityMap(sql = customGptDb()) {
  const rows = await sql.query(`
    SELECT
      vc.vin,
      vc.canal_salida,
      vc.sucursal_venta_id,
      vc.dealer_id,
      vc.dealer_group_id,
      vc.resolution_status,
      sm.nombre_canonico AS sucursal_venta_nombre,
      dm.nombre_comercial AS dealer_nombre,
      dg.nombre_canonico AS dealer_group_nombre
    FROM vehiculo_canonico vc
    LEFT JOIN sucursales_master sm ON sm.sucursal_id = vc.sucursal_venta_id
    LEFT JOIN dealers_master dm ON dm.dealer_id = vc.dealer_id
    LEFT JOIN dealer_groups dg ON dg.dealer_group_id = vc.dealer_group_id
  `);
  return new Map(rows.map((row) => [String(row.vin), row]));
}

function classifyCommercialRow(row) {
  if (!row) return 'UNRESOLVED';
  if (row.canal_salida === 'TIENDA_PROPIA') return 'OWN_STORES';
  if (row.canal_salida === 'DEALER') return 'DEALERS';
  return 'UNRESOLVED';
}

function validateScopedSale(sale, universe) {
  if (universe === 'OWN_STORES') {
    if (sale.canal_salida !== 'TIENDA_PROPIA') return 'OWN_STORES_CONTAINS_NON_STORE';
    if (sale.dealer_id != null) return 'OWN_STORES_CONTAINS_DEALER_ID';
  }
  if (universe === 'DEALERS') {
    if (sale.canal_salida !== 'DEALER') return 'DEALERS_CONTAINS_NON_DEALER';
    if (sale.sucursal_venta_id != null) return 'DEALERS_CONTAINS_STORE_ID';
  }
  return null;
}

export function scopeRecognizedSalesToCommercialUniverse({ recognizedSales, commercialMap, universe }) {
  if (!Array.isArray(recognizedSales)) throw new Error('recognizedSales is required');
  if (!(commercialMap instanceof Map)) throw new Error('commercialMap is required');
  const commercialUniverse = parseCommercialUniverse(universe);

  const coverage = {
    recognized_sales: recognizedSales.length,
    included_sales: 0,
    excluded_other_universe: 0,
    unresolved_channel: 0,
    unresolved_destination: 0,
    null_vin_sales: 0,
  };
  const violations = [];
  const sales = [];

  for (const sale of recognizedSales) {
    const canonical = sale.vin == null ? null : commercialMap.get(String(sale.vin));
    const classified = classifyCommercialRow(canonical);
    if (sale.vin == null) coverage.null_vin_sales += 1;
    if (classified === 'UNRESOLVED') coverage.unresolved_channel += 1;

    const include = commercialUniverse === 'COMPANY' || classified === commercialUniverse;
    if (!include) {
      coverage.excluded_other_universe += 1;
      continue;
    }

    const scoped = {
      ...sale,
      commercial_universe: commercialUniverse,
      canonical_commercial_universe: classified,
      canal_salida: canonical?.canal_salida ?? null,
      sucursal_venta_id: canonical?.sucursal_venta_id ?? null,
      sucursal_venta_nombre: canonical?.sucursal_venta_nombre ?? null,
      dealer_id: canonical?.dealer_id ?? null,
      dealer_nombre: canonical?.dealer_nombre ?? null,
      dealer_group_id: canonical?.dealer_group_id ?? null,
      dealer_group_nombre: canonical?.dealer_group_nombre ?? null,
      commercial_resolution_status: canonical?.resolution_status ?? 'UNRESOLVED',
    };

    if ((classified === 'OWN_STORES' && scoped.sucursal_venta_id == null)
      || (classified === 'DEALERS' && scoped.dealer_id == null)) {
      coverage.unresolved_destination += 1;
    }

    const violation = validateScopedSale(scoped, commercialUniverse);
    if (violation) violations.push({ vin: sale.vin ?? null, code: violation });
    sales.push(scoped);
  }

  coverage.included_sales = sales.length;
  const valid = violations.length === 0;
  return {
    commercial_scope: {
      universe: commercialUniverse,
      authority: 'vehiculo_canonico',
      valid,
      scope_id: 'ventas_commercial_context_v01',
    },
    sales,
    coverage,
    validation: { valid, violations },
  };
}

export async function buildVentasCommercialContext(input = {}) {
  const universe = parseCommercialUniverse(input.commercial_universe ?? input.universe);
  const cutoffDate = input.cutoff_date ?? input.date_to ?? input.cutoffDate ?? null;
  const cutoffMonth = input.cutoff_month ?? input.cutoffMonth ?? null;
  const sql = customGptDb();
  const [ventasContext, commercialMap] = await Promise.all([
    buildVentasContext({ cutoffDate, cutoffMonth }),
    loadCommercialIdentityMap(sql),
  ]);
  return {
    ...scopeRecognizedSalesToCommercialUniverse({
      recognizedSales: ventasContext.recognizedSales,
      commercialMap,
      universe,
    }),
    source_context: {
      motor: 'ventas_context_v01',
      cutoff_date: cutoffDate,
      cutoff_month: cutoffMonth,
    },
  };
}
