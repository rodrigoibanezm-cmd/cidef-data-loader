import { buildCompetitiveRelations } from '../competitive-relation/buildCompetitiveRelations.js';

export const ENGINE_NAME = 'competitive_relation_v01';
export const ENGINE_VERSION = '0.1';

export async function competitiveRelationV01(input = {}) {
  const context = await buildCompetitiveRelations(input);
  const hasWarnings = context.warnings.length > 0 || !context.validation.source_signal_backtest_ok;
  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    status: context.validation.ok && !hasWarnings ? 'ok' : 'warning',
    policy: {
      dependency: 'competitive_signal_backtest_v01 v0.2',
      persistence: 'runtime only; no competitor table',
      grain: 'target_model_id × peer_entity_key × peer_universe × requested period',
      peer_scope: 'same structural universe and explicit known origin_group',
      rule: 'median share gap <= 3 pp AND joint active months >= 6 AND crossings >= 1',
      output: 'selected relations only; pair_offset/pair_limit are transport pagination',
      score: 'none',
    },
    sharedContext: context,
  };
}
