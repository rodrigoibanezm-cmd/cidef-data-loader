import { buildShareExpectationBacktest } from '../share-expectation/buildShareExpectationBacktest.js';
import { formatShareBacktestOutput } from '../share-expectation/formatShareBacktestOutput.js';
import { parseShareBacktestInput } from '../share-expectation/shareBacktestInput.js';

export const ENGINE_NAME = 'organizational_share_expectation_backtest_v01';
export const ENGINE_VERSION = '0.3';

export async function organizationalShareExpectationBacktestV01(input = {}) {
  const parsed = parseShareBacktestInput(input);
  const rawResult = await buildShareExpectationBacktest(parsed);
  const result = formatShareBacktestOutput(rawResult, parsed);
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    inputs: {
      grain: parsed.grain,
      start_month: parsed.startMonth,
      end_month: parsed.endMonth,
      candidate_baselines: parsed.candidates.map((row) => row.name),
      output_mode: parsed.outputMode,
      detail_limit: parsed.detailLimit,
      detail_candidate: parsed.detailCandidate,
    },
    policy: {
      question: 'which simple historical baseline best estimates monthly organizational share?',
      actual_share: parsed.grain === 'tienda' ? 'share_of_cidef' : 'share_of_store',
      relative_gap_pp: '100 * (actual_share - expected_share); null when expected_share is unavailable',
      selection_scope: 'one global rule per grain; unit results are diagnostic only',
      calendar: 'exact calendar lags only; missing months remain missing and are never imputed',
      walk_forward: 'expected share uses only explicit months before target month',
      comparison: 'ranking metrics use the common evaluable unit-month set',
      metrics: 'MAE, bias, median absolute error and relative gap distribution in percentage points',
      storage: 'runtime only; consumes ventas_organizational_context_v01',
    },
    ...result,
  };
}
