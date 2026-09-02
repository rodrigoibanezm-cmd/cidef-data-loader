import { buildVentasContext } from '../ventas/buildVentasContext.js';
import { parseVentasCutoff } from '../ventas/parseVentasCutoff.js';

export const ENGINE_NAME = 'ventas_daily_context_v01';
export const ENGINE_VERSION = '0.1';

function parseInput(input) {
  if (!input?.cutoff_date) throw new Error('cutoff_date is required');
  const cutoff = parseVentasCutoff({ cutoffDate: input.cutoff_date });
  return { cutoffDate: cutoff.value };
}

export function calculateVentasDailyContext(context, { cutoffDate }) {
  if (context?.cutoff_date !== cutoffDate) {
    throw new Error('ventas context cutoff does not match requested cutoff_date');
  }
  const month = cutoffDate.slice(0, 7);
  const targetMonth = (context.monthlySales || []).find((row) => row.month === month);

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.validation?.ok ? 'ok' : 'warning',
    inputs: { cutoff_date: cutoffDate },
    policy: {
      recognition: 'ventas_context_v01 LAST-by-VIN inside cutoff',
      temporal_guard: 'fecha_factura <= cutoff_date before VIN recognition',
      organization_scope: 'not filtered; tienda/dealer classification is downstream',
    },
    as_of: {
      cutoff_date: cutoffDate,
      month,
      day_of_month: Number(cutoffDate.slice(8, 10)),
      recognized_sales_total: context.validation?.recognized_units ?? null,
      month_sales_to_date: targetMonth?.sales ?? 0,
    },
    monthly_sales: context.monthlySales || [],
    coverage: context.coverage,
    validation: {
      ventas_context_ok: context.validation?.ok === true,
      cutoff_context_match: context.cutoff_date === cutoffDate,
      no_post_cutoff_evidence_used: true,
    },
    warnings: context.warnings || [],
  };
}

export async function ventasDailyContextV01(input = {}) {
  const parsed = parseInput(input);
  const context = await buildVentasContext({ cutoffDate: parsed.cutoffDate });
  return calculateVentasDailyContext(context, parsed);
}
