import { shiftMonth } from '../expectation/monthSeries.js';
import { calculateVentasContext } from '../ventas/buildVentasContext.js';
import { monthRange } from './monthRange.js';
import { aggregateRecognizedSales } from './orgSalesSeries.js';

export function buildCutoffSnapshots(rows, identities, parsed) {
  const endContext = calculateVentasContext(rows, { cutoffMonth: parsed.endMonth });
  const firstDataMonth = endContext.monthlySales?.[0]?.month || parsed.startMonth;
  const firstCutoff = shiftMonth(firstDataMonth, -1);
  const cutoffs = monthRange(firstCutoff, parsed.endMonth);
  const snapshots = new Map();
  const contextWarnings = new Set();
  let contextsOk = true;

  for (const cutoff of cutoffs) {
    const context = cutoff === parsed.endMonth
      ? endContext
      : calculateVentasContext(rows, { cutoffMonth: cutoff });
    const org = aggregateRecognizedSales(context, parsed.grain, identities);
    snapshots.set(cutoff, {
      cutoff,
      units: org.units,
      coverage: org.coverage,
      unresolved_keys: org.unresolvedKeys,
    });
    contextsOk = contextsOk && context.validation?.ok === true;
    for (const warning of context.warnings || []) contextWarnings.add(String(warning));
  }

  return {
    snapshots,
    cutoffs,
    first_data_month: firstDataMonth,
    contexts_ok: contextsOk,
    context_warnings: [...contextWarnings],
  };
}
