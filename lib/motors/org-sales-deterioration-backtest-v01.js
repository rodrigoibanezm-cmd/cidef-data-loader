import { buildOrgSalesDeteriorationBacktest } from '../deterioration/buildOrgSalesDeteriorationBacktest.js';
import { formatOrgBacktestOutput } from '../deterioration/formatOrgBacktestOutput.js';
import { parseOrgDeteriorationInput } from '../deterioration/orgDeteriorationInput.js';

export const ENGINE_NAME = 'org_sales_deterioration_backtest_v01';
export const ENGINE_VERSION = '0.4';

export async function orgSalesDeteriorationBacktestV01(input = {}) {
  const parsed = parseOrgDeteriorationInput(input);
  const rawResult = await buildOrgSalesDeteriorationBacktest(parsed);
  const result = formatOrgBacktestOutput(rawResult, parsed);
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
      output_mode: parsed.outputMode,
      detail_limit: parsed.detailLimit,
      detail_baseline: parsed.detailBaseline,
      detail_deviation_method: parsed.detailDeviation,
      detail_persistence_rule: parsed.detailPersistence,
    },
    policy: {
      question: 'when does an adverse own-sales deviation become persistent instead of punctual noise?',
      observation_grain: `${parsed.grain} canonical x month`,
      recognition: 'ventas_context_v01 LAST-by-VIN cutoff-aware',
      identity: 'exact RAW key to unique MASTER identity; no fuzzy fallback',
      observation: parsed.grain === 'tienda'
        ? 'positive sales are observed; NV-backed no-sale months are ACTIVE_ZERO; otherwise UNKNOWN'
        : 'positive sales are observed; no-sale months remain UNKNOWN because seller ACTIVE_ZERO is not certified',
      missingness: 'UNKNOWN is not zero-filled, is not evaluable, and breaks persistence continuity',
      walk_forward: 'baseline uses cutoff t-1; actual uses cutoff t; future only evaluates alarms',
      persistence: 'diagnostic candidates only; no final threshold selected by this motor',
      output: 'summary by default; bounded candidate x unit, stability and episode detail modes',
      storage: 'runtime only; no analytical table, mart or cube',
    },
    ...result,
  };
}
