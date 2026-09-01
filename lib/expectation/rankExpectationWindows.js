import { calculateForecastMetrics } from './calculateForecastMetrics.js';
import { rankExpectedCandidates } from './rankExpectedCandidates.js';

function summarizeWindow(rows, candidateNames, label) {
  const metrics = candidateNames.map((name) => calculateForecastMetrics(rows, name));
  const ranking = rankExpectedCandidates(metrics);
  return {
    label,
    months_evaluated: rows.length,
    first_month: rows[0]?.month ?? null,
    last_month: rows.at(-1)?.month ?? null,
    winner: ranking[0]?.candidate ?? null,
    ranking,
  };
}

export function rankExpectationWindows(rows, candidateNames) {
  const latestYear = rows.at(-1)?.month?.slice(0, 4) ?? null;
  const rolling = ['2023', '2024', '2025'].map((year) => {
    const filtered = rows.filter((row) => row.month >= `${year}-01`);
    return summarizeWindow(filtered, candidateNames, `${year}-${latestYear ?? 'latest'}`);
  });

  const years = [...new Set(rows.map((row) => row.month.slice(0, 4)))].map((year) => {
    const filtered = rows.filter((row) => row.month.startsWith(`${year}-`));
    return summarizeWindow(filtered, candidateNames, year);
  });

  return { rolling, years };
}
