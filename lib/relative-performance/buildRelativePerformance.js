import { shiftMonth } from '../expectation/monthSeries.js';
import { buildShareSeries } from '../share-expectation/buildShareSeries.js';
import { buildVentasOrganizationalContext } from '../ventas-org/buildVentasOrganizationalContext.js';
import { buildRelativePerformanceRows } from './buildRelativePerformanceRows.js';
import { getCertifiedRelativeRule } from './relativePerformanceRules.js';
import { validateRelativePerformance } from './validateRelativePerformance.js';

export function calculateRelativePerformance(context, parsed) {
  const rule = getCertifiedRelativeRule(parsed.grain);
  const series = buildShareSeries(context, parsed.grain);
  const rows = buildRelativePerformanceRows(series, parsed, rule);
  const validation = validateRelativePerformance(context, series, parsed, rule, rows);
  const nonEvaluable = rows.filter((row) => !row.evaluable).length;
  const warnings = [...(context.warnings || [])];
  if (nonEvaluable) {
    warnings.push(`${nonEvaluable} row(s) are non-evaluable because exact calendar history is incomplete`);
  }
  warnings.push('CURRENT_SNAPSHOT only: results are not historical point-in-time snapshots');
  return {
    status: validation.ok ? 'ok' : 'warning',
    certified_rule: {
      baseline: rule.name,
      required_history_months: rule.lag,
      actual_share: rule.actual_share,
    },
    rows,
    coverage: {
      rows_total: rows.length,
      evaluable_rows: rows.length - nonEvaluable,
      non_evaluable_rows: nonEvaluable,
    },
    validation,
    warnings,
  };
}

export async function buildRelativePerformance(parsed) {
  const rule = getCertifiedRelativeRule(parsed.grain);
  const historyStart = shiftMonth(parsed.startMonth, -rule.lag);
  const context = await buildVentasOrganizationalContext({
    startMonth: historyStart,
    endMonth: parsed.endMonth,
  });
  return calculateRelativePerformance(context, parsed);
}
