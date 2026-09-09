import { calculateIntramonthSalesHistoryContext } from './intramonth-sales-history-context-v01.js';
import { loadVentasRows } from '../ventas/loadVentasRows.js';
import { loadOrganizationalIdentityMaps } from '../ventas-org/loadOrganizationalIdentityMaps.js';
import { parseFechaFactura } from './ventas-monthly-dedup-sensitivity-v01.js';
import { commercialMonthForDate } from '../ventas/commercialMonth.js';
import { currentDateSantiago } from '../intramonth-sales-history/historyRange.js';
import { calculateSalesPaceChange } from '../sales-pace-change/calculateSalesPaceChange.js';

export const ENGINE_NAME = 'sales_pace_change_v01';
export const ENGINE_VERSION = '0.1';

function firstCommercialMonth(rows, endMonth) {
  let first = null;
  for (const row of rows || []) {
    const parsed = parseFechaFactura(row?.fecha_factura);
    if (!parsed || parsed.error) continue;
    const date = parsed.date.toISOString().slice(0, 10);
    const month = commercialMonthForDate(date);
    if (month > endMonth) continue;
    if (first == null || month < first) first = month;
  }
  if (!first) throw new Error('No parseable ventas history found through current commercial month');
  return first;
}

export async function salesPaceChangeV01(input = {}, now = new Date()) {
  const currentDate = currentDateSantiago(now);
  const currentMonth = commercialMonthForDate(currentDate);
  const [rows, identityMaps] = await Promise.all([
    loadVentasRows(),
    loadOrganizationalIdentityMaps(),
  ]);
  const startMonth = firstCommercialMonth(rows, currentMonth);
  const history = calculateIntramonthSalesHistoryContext(
    rows,
    identityMaps,
    { start_month: startMonth, end_month: currentMonth },
    now,
  );
  const result = calculateSalesPaceChange(history, input, currentDate);
  return {
    ...result,
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    coverage: {
      ...result.coverage,
      history_start_month: startMonth,
      history_end_month: currentMonth,
    },
  };
}
