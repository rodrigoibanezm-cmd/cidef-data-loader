import { queryDb } from '../neon.js';
import { parseDealerAgingInput } from '../dealer-aging/dealerAgingInput.js';
import {
  buildDealerAgingSummaryQuery,
  buildDealerAgingByDealerQuery,
  buildDealerAgingDetailQuery,
} from '../dealer-aging/dealerAgingQuery.js';
import { buildDealerAgingResult } from '../dealer-aging/buildDealerAgingResult.js';

export const ENGINE_NAME = 'dealer_inventory_aging_v01';
export const ENGINE_VERSION = '0.1';

export async function dealerInventoryAgingV01(rawInput = {}) {
  const input = parseDealerAgingInput(rawInput);
  const summarySql = buildDealerAgingSummaryQuery(input);
  const byDealerSql = buildDealerAgingByDealerQuery(input);
  const detailSql = buildDealerAgingDetailQuery(input);

  const [summaryRows, dealerRows, detailRows] = await Promise.all([
    queryDb(summarySql.query, summarySql.params),
    queryDb(byDealerSql.query, byDealerSql.params),
    queryDb(detailSql.query, detailSql.params),
  ]);
  const result = buildDealerAgingResult({
    input,
    summaryRow: summaryRows[0],
    dealerRows,
    detailRows,
  });
  const validationsOk = Object.values(result.validation).every(Boolean);
  const warnings = [];
  if (result.summary.missing_fecha_ingreso > 0) warnings.push('Some current dealer stock lacks fecha_ingreso_stock');
  if (result.summary.aged_unresolved_dealer > 0) warnings.push('Some aged dealer stock has unresolved canonical dealer identity');

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: validationsOk ? (warnings.length ? 'warning' : 'ok') : 'warning',
    inputs: {
      min_days: input.minDays,
      as_of: input.asOf || 'CURRENT_DATE',
      dealer_id: input.dealerId,
      dealer_group_id: input.dealerGroupId,
      detail_limit: input.detailLimit,
    },
    policy: {
      family: 'Familia 5 - ACCIONABILIDAD',
      source: 'vehiculo_canonico',
      legacy_contract: 'dealer_inventory_aging',
      universe: "vigente=true AND canal_salida='DEALER'",
      aging_from: 'fecha_ingreso_stock',
      aging_rule: 'as_of - fecha_ingreso_stock',
      threshold: 'aging_days > min_days',
      invoice_rule: 'factura does not remove a vehicle from dealer stock',
      eta_rule: 'fecha_eta is not used for aging',
      unresolved_dealer_identity: 'preserved as NO_RESUELTO',
      stock_available: 'not defined by this motor',
    },
    ...result,
    warnings,
  };
}
