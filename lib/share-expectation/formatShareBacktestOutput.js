function detailRows(rows, parsed, field) {
  const matched = parsed.detailCandidate
    ? rows.filter((row) => row.candidate === parsed.detailCandidate
      || row.predictions?.[parsed.detailCandidate])
    : rows;
  return {
    [field]: matched.slice(0, parsed.detailLimit),
    detail: {
      matched_rows: matched.length,
      returned_rows: Math.min(matched.length, parsed.detailLimit),
      truncated: matched.length > parsed.detailLimit,
    },
  };
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
    return { ...base, ...detailRows(result.monthly_backtest, parsed, 'monthly_backtest') };
  }
  if (parsed.outputMode === 'units') {
    return { ...base, ...detailRows(result.unit_results, parsed, 'unit_results') };
  }
  if (parsed.outputMode === 'stability') {
    return { ...base, ...detailRows(stabilityRows(result), parsed, 'temporal_stability') };
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
