import { relativeGapPp } from './shareGapStatistics.js';

function bounded(rows, limit, field) {
  return {
    [field]: rows.slice(0, limit),
    detail: {
      matched_rows: rows.length,
      returned_rows: Math.min(rows.length, limit),
      truncated: rows.length > limit,
    },
  };
}

function candidateRows(rows, parsed) {
  if (!parsed.detailCandidate) return rows;
  return rows.filter((row) => row.candidate === parsed.detailCandidate);
}

function selectedCandidate(parsed) {
  if (parsed.detailCandidate) return parsed.detailCandidate;
  return parsed.candidates.length === 1 ? parsed.candidates[0].name : null;
}

function monthlyRows(rows, parsed) {
  const candidate = selectedCandidate(parsed);
  if (!candidate) return rows;
  return rows.map((row) => {
    const prediction = row.predictions[candidate];
    return {
      unit_key: row.unit_key,
      sucursal_id: row.sucursal_id,
      persona_id: row.persona_id,
      month: row.month,
      sales: row.sales,
      parent_sales: row.parent_sales,
      actual_share: row.share,
      candidate,
      expected_share: prediction.expected,
      relative_gap_pp: relativeGapPp(row.share, prediction.expected),
      source_months: prediction.source_months,
      evaluable: prediction.evaluable,
    };
  });
}

function stabilityRows(result) {
  return [
    ...result.temporal_stability.calendar_years.map((row) => ({ scope: 'calendar_year', ...row })),
    ...result.temporal_stability.rolling_12_months.map((row) => ({ scope: 'rolling_12_months', ...row })),
  ];
}

function summarizeStability(result) {
  const years = result.temporal_stability.calendar_years;
  const rolling = result.temporal_stability.rolling_12_months;
  return {
    calendar_year_rows: years.length,
    rolling_12_month_rows: rolling.length,
    first_calendar_year: years.length ? years[0].label : null,
    last_calendar_year: years.length ? years.at(-1).label : null,
    first_rolling_window: rolling.length ? rolling[0].label : null,
    last_rolling_window: rolling.length ? rolling.at(-1).label : null,
  };
}

function common(result) {
  return {
    status: result.status,
    ranking: result.ranking,
    candidate_results: result.candidate_results,
    coverage: result.coverage,
    validation: result.validation,
    warnings: result.warnings,
  };
}

export function formatShareBacktestOutput(result, parsed) {
  const base = common(result);
  if (parsed.outputMode === 'monthly') {
    return { ...base, ...bounded(monthlyRows(result.monthly_backtest, parsed), parsed.detailLimit, 'monthly_backtest') };
  }
  if (parsed.outputMode === 'units') {
    return { ...base, ...bounded(candidateRows(result.unit_results, parsed), parsed.detailLimit, 'unit_results') };
  }
  if (parsed.outputMode === 'stability') {
    return { ...base, ...bounded(candidateRows(stabilityRows(result), parsed), parsed.detailLimit, 'temporal_stability') };
  }
  return {
    ...base,
    temporal_stability: summarizeStability(result),
    detail_available: {
      output_modes: ['monthly', 'units', 'stability'],
      default_detail_limit: parsed.detailLimit,
      candidate_filter: 'detail_candidate',
    },
  };
}
