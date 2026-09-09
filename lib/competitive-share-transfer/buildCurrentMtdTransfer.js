import { buildHistoricalTransfer } from './buildHistoricalTransfer.js';
import { safeGrowth } from './transferMath.js';

export function buildCurrentMtdTransfer(currentRows, comparisonRows, parsed, snapshotDate) {
  const currentMonth = parsed.dateCutoff.slice(0, 7);
  const comparisonMonth = `${Number(parsed.dateCutoff.slice(0, 4)) - 1}${parsed.dateCutoff.slice(4, 7)}`;
  const requestedDay = Number(parsed.dateCutoff.slice(8, 10));
  const [comparisonYear, comparisonMonthNumber] = comparisonMonth.split('-').map(Number);
  const comparisonDay = Math.min(requestedDay, new Date(Date.UTC(comparisonYear, comparisonMonthNumber, 0)).getUTCDate());
  const comparisonDateTo = `${comparisonMonth}-${String(comparisonDay).padStart(2, '0')}`;
  const combined = [
    ...currentRows.map((row) => ({ ...row, month: currentMonth })),
    ...comparisonRows.map((row) => ({ ...row, month: comparisonMonth })),
  ];
  const historicalShape = {
    ...parsed,
    mode: 'CURRENT_MTD',
    temporalBasis: 'MONTHLY_YOY',
    dateFrom: `${currentMonth}-01`,
    dateTo: parsed.dateCutoff,
  };
  const built = buildHistoricalTransfer(combined, historicalShape);
  const chineseCurrent = currentRows.reduce((sum, row) => sum
    + (row.brand_origin_group === 'CHINESE' ? Number(row.units || 0) : 0), 0);
  const chineseComparable = comparisonRows.reduce((sum, row) => sum
    + (row.brand_origin_group === 'CHINESE' ? Number(row.units || 0) : 0), 0);
  const chineseGrowth = safeGrowth(chineseCurrent, chineseComparable);
  const detail = built.detail.map((row) => {
    const marketGrowth = safeGrowth(row.market_vin, row.comparable_market_vin);
    return {
      ...row,
      date_cutoff: parsed.dateCutoff,
      effective_cutoff_date: parsed.dateCutoff,
      snapshot_date: snapshotDate,
      data_status: { current: 'PRELIMINARY', comparison: 'CONSOLIDATED' },
      current_date_from: `${currentMonth}-01`,
      current_date_to: parsed.dateCutoff,
      comparable_date_from: `${comparisonMonth}-01`,
      comparable_date_to: comparisonDateTo,
      current_days_observed: requestedDay,
      comparison_days_observed: comparisonDay,
      current_mtd_subject_vin: row.subject_vin,
      comparable_mtd_subject_vin: row.comparable_subject_vin,
      current_mtd_market_vin: row.market_vin,
      comparable_mtd_market_vin: row.comparable_market_vin,
      current_mtd_share: row.subject_share,
      comparable_mtd_share: row.comparable_subject_share,
      mtd_share_change_pp: row.subject_share_change_pp,
      mtd_growth_pct: row.subject_growth_pct,
      market_mtd_growth_pct: marketGrowth.value,
      market_mtd_growth_status: marketGrowth.status,
      chinese_market_mtd_growth_pct: chineseGrowth.value,
      chinese_market_mtd_growth_status: chineseGrowth.status,
    };
  });
  const summaryByKey = new Map(built.summaries.map((row) => [row.competitor_entity.key, row]));
  const summaries = detail.map((row) => ({
    ...summaryByKey.get(row.competitor_entity.key),
    inverse_direction_flag: row.inverse_direction_flag,
    inverse_share_change_magnitude: row.inverse_share_change_magnitude,
    inverse_vin_change_magnitude: row.inverse_vin_change_magnitude,
  }));
  return { ...built, detail, summaries };
}
