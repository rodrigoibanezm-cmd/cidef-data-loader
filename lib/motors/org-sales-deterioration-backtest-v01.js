import { buildOrgSalesDeteriorationBacktest } from '../deterioration/buildOrgSalesDeteriorationBacktest.js';
import { parseOrgDeteriorationInput } from '../deterioration/orgDeteriorationInput.js';

export const ENGINE_NAME = 'org_sales_deterioration_backtest_v01';
export const ENGINE_VERSION = '0.1';

export async function orgSalesDeteriorationBacktestV01(input = {}) {
  const parsed = parseOrgDeteriorationInput(input);
  const result = await buildOrgSalesDeteriorationBacktest(parsed);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    inputs: {
      grain: parsed.grain,
      start_month: parsed.startMonth,
      end_month: parsed.endMonth,
      candidate_baselines: parsed.baselines,
      candidate_deviation_methods: parsed.deviations,
      candidate_persistence_rules: parsed.persistence,
    },
    policy: {
      question: 'when does an adverse own-sales deviation become persistent instead of punctual noise?',
      observation_grain: `${parsed.grain} canonical x month`,
      recognition: 'ventas_context_v01 LAST-by-VIN cutoff-aware',
      identity: 'exact RAW key to unique MASTER identity; no fuzzy fallback',
      walk_forward: 'baseline uses cutoff t-1; actual uses cutoff t; future only evaluates alarms',
      persistence: 'diagnostic candidates only; no final threshold selected by this motor',
      storage: 'runtime only; no analytical table, mart or cube',
    },
    ...result,
  };
}
