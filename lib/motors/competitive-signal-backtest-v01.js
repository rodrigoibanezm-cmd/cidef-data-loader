import { buildSignalBacktest } from '../competitive-signal-backtest/buildSignalBacktest.js';
import { projectBacktestOutput } from '../competitive-signal-backtest/projectBacktestOutput.js';

export const ENGINE_NAME = 'competitive_signal_backtest_v01';
export const ENGINE_VERSION = '0.2';

export async function competitiveSignalBacktestV01(input = {}) {
  const fullContext = await buildSignalBacktest(input);
  const context = projectBacktestOutput(fullContext);
  const hasWarnings = context.warnings.length > 0 || !context.validation.base_monthly_context_ok;
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.validation.ok && !hasWarnings ? 'ok' : 'warning',
    policy: {
      dependency: 'competitive_context_v01 + shared monthly trajectory helpers',
      persistence: 'runtime only; no competitor or backtest table',
      grain: 'target_model_id × peer_entity_key × peer_universe × requested period',
      active_semantics: 'observed=true; synthetic zero-fill is inactive',
      share_gap: 'absolute and signed monthly share difference in percentage points',
      crossings: 'joint-active sign changes only; inactive gaps are never bridged',
      runs: 'converging/diverging runs use adjacent joint-active months only',
      output: 'summary is paginated transport over all calculated pairs; pair_detail requires explicit pair_keys',
      competitor_rule: 'none; this motor generates features and diagnostics only',
    },
    sharedContext: context,
  };
}
