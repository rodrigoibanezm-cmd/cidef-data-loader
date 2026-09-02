function passes(row, thresholds) {
  return row.targets_evaluable > 0
    && Number.isFinite(row.median_ape_pct)
    && Number.isFinite(row.p90_ape_pct)
    && row.median_ape_pct <= thresholds.median_ape_pct
    && row.p90_ape_pct <= thresholds.p90_ape_pct;
}

function summarizeGrain(rows, grain, thresholds) {
  const ordered = rows
    .filter((row) => row.grain === grain)
    .sort((a, b) => a.day_of_month - b.day_of_month);
  const firstHit = ordered.find((row) => passes(row, thresholds)) ?? null;
  let selected = null;

  for (let index = 0; index < ordered.length; index += 1) {
    if (!passes(ordered[index], thresholds)) continue;
    const later = ordered.slice(index).filter((row) => row.targets_evaluable > 0);
    if (later.length > 0 && later.every((row) => passes(row, thresholds))) {
      selected = ordered[index];
      break;
    }
  }

  const laterFailures = selected
    ? []
    : ordered.filter((row) => row.targets_evaluable > 0 && !passes(row, thresholds));

  return {
    grain,
    predictability_day: selected?.day_of_month ?? null,
    first_day_meeting_thresholds: firstHit?.day_of_month ?? null,
    median_ape_pct_at_day: selected?.median_ape_pct ?? null,
    p90_ape_pct_at_day: selected?.p90_ape_pct ?? null,
    targets_evaluable_at_day: selected?.targets_evaluable ?? null,
    maintained_through_last_evaluable_day: selected != null,
    last_evaluable_day: ordered.filter((row) => row.targets_evaluable > 0).at(-1)?.day_of_month ?? null,
    failing_days_if_not_found: laterFailures.map((row) => row.day_of_month),
  };
}

export function derivePredictabilityDays(candidateResults, thresholds) {
  return ['CIDEF_PROPIO', 'TIENDA_PROPIA_POOLED']
    .map((grain) => summarizeGrain(candidateResults || [], grain, thresholds));
}
