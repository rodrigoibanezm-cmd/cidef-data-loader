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

function monthlyRows(rows, parsed) {
  if (!parsed.detailCandidate) return rows;
  return rows.map((row) => ({
    unit_key: row.unit_key,
    sucursal_id: row.sucursal_id,
    persona_id: row.persona_id,
    month: row.month,
    actual_share: row.share,
    candidate: parsed.detailCandidate,
    ...row.predictions[parsed.detailCandidate],
  }));
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
