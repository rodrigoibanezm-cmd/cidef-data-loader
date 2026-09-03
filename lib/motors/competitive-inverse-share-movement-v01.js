import { buildCompetitiveInverseShareMovement } from '../competitive-inverse-share-movement/buildCompetitiveInverseShareMovement.js';

export const ENGINE_NAME = 'competitive_inverse_share_movement_v01';
export const ENGINE_VERSION = '0.1';

export async function competitiveInverseShareMovementV01(input = {}) {
  const context = await buildCompetitiveInverseShareMovement(input);
  const hasWarnings = context.warnings.length > 0 || !context.validation.source_signal_backtest_ok;
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.validation.ok && !hasWarnings ? 'ok' : 'warning',
    policy: {
      dependency: 'competitive_relation_v01 rule + competitive_signal_backtest_v01 monthly pair evidence',
      persistence: 'runtime only; no table or materialization',
      grain: 'target_model_id × related peer_entity_key × peer_universe × requested period',
      evaluable_transition: 'adjacent calendar months with target and peer observed at both endpoints and finite shares',
      absence: 'synthetic zero-fill is inactive and is never converted into observed zero evidence',
      interpretation: 'observed inverse share movement only; no causal transfer or substitution claim',
      output: 'related pairs ordered by transparent inverse-direction consistency; pair_offset/pair_limit are transport only',
      score: 'none',
    },
    sharedContext: context,
  };
}
