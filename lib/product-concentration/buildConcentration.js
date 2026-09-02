import { shiftMonth } from '../expectation/monthSeries.js';

const pct = (value) => Number((100 * value).toFixed(2));

function monthRange(startMonth, endMonth) {
  const months = [];
  for (let month = startMonth; month && month <= endMonth; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

function catalogIndex(rows = []) {
  return new Map(rows.map((row) => [Number(row.modelo_id), row]));
}

function concentrationForSales(sales, thresholdPct, catalog) {
  const counts = new Map();
  for (const sale of sales) counts.set(sale.modelo_id, (counts.get(sale.modelo_id) || 0) + 1);
  const total = sales.length;
  const ranked = [...counts.entries()]
    .map(([modeloId, units]) => ({ modeloId, units }))
    .sort((a, b) => b.units - a.units || a.modeloId - b.modeloId);

  let cumulative = 0;
  const rows = ranked.map((row, index) => {
    cumulative += row.units;
    const model = catalog.get(row.modeloId);
    return {
      rank: index + 1,
      modelo_id: row.modeloId,
      marca: model?.marca ?? null,
      modelo: model?.modelo ?? null,
      sales: row.units,
      share_pct: total ? pct(row.units / total) : 0,
      cumulative_share_pct: total ? pct(cumulative / total) : 0,
    };
  });
  const cutoffIndex = total
    ? rows.findIndex((row) => row.cumulative_share_pct >= thresholdPct)
    : -1;
  const paretoRows = cutoffIndex >= 0 ? rows.slice(0, cutoffIndex + 1) : [];
  const paretoSales = paretoRows.reduce((sum, row) => sum + row.sales, 0);
  const distinctModels = rows.length;

  return {
    resolved_product_sales: total,
    distinct_models: distinctModels,
    pareto_model_count: paretoRows.length,
    pareto_model_share_pct: distinctModels ? pct(paretoRows.length / distinctModels) : 0,
    pareto_sales: paretoSales,
    pareto_sales_share_pct: total ? pct(paretoSales / total) : 0,
    pareto_models: paretoRows,
    all_models: rows,
  };
}

function summarizePeriod(periodSales, thresholdPct, catalog) {
  const resolved = periodSales.filter((sale) => sale.product_identity_status === 'RESOLVED');
  const ambiguous = periodSales.filter((sale) => sale.product_identity_status === 'AMBIGUOUS').length;
  const unresolved = periodSales.length - resolved.length - ambiguous;
  return {
    recognized_sales: periodSales.length,
    product_ambiguous: ambiguous,
    product_unresolved: unresolved,
    ...concentrationForSales(resolved, thresholdPct, catalog),
  };
}

export function buildConcentration(resolvedSales, modelCatalog, parsed) {
  const catalog = catalogIndex(modelCatalog);
  const periodSales = resolvedSales.filter(
    (sale) => sale.mes_venta >= parsed.startMonth && sale.mes_venta <= parsed.endMonth,
  );
  const period = summarizePeriod(periodSales, parsed.thresholdPct, catalog);
  const monthly = monthRange(parsed.startMonth, parsed.endMonth).map((month) => ({
    month,
    ...summarizePeriod(periodSales.filter((sale) => sale.mes_venta === month), parsed.thresholdPct, catalog),
  }));

  const missingCatalogIds = [...new Set(period.all_models
    .filter((row) => row.modelo == null || row.marca == null)
    .map((row) => row.modelo_id))];
  const allReached = [period, ...monthly].every(
    (row) => row.resolved_product_sales === 0 || row.pareto_sales_share_pct >= parsed.thresholdPct,
  );
  return {
    period,
    monthly,
    coverage: {
      recognized_sales_in_period: period.recognized_sales,
      product_resolved: period.resolved_product_sales,
      product_ambiguous: period.product_ambiguous,
      product_unresolved: period.product_unresolved,
      resolved_share_pct: period.recognized_sales ? pct(period.resolved_product_sales / period.recognized_sales) : 0,
      missing_catalog_model_ids: missingCatalogIds,
    },
    validation: {
      recognized_sales_reconcile: period.recognized_sales === period.resolved_product_sales + period.product_ambiguous + period.product_unresolved,
      resolved_model_sales_reconcile: period.all_models.reduce((sum, row) => sum + row.sales, 0) === period.resolved_product_sales,
      pareto_threshold_reached_or_empty: allReached,
      model_catalog_complete: missingCatalogIds.length === 0,
    },
  };
}
