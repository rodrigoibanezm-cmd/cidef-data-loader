import { buildCompetitiveTrajectory } from '../competitive-trajectory/buildCompetitiveTrajectory.js';
import { parseCompetitiveInput } from '../competitive/competitiveInput.js';
import { parseBacktestOutputInput } from './backtestInput.js';
import { buildPairSeries } from './pairSeries.js';
import { pairDetail, summarizePair } from './pairFeatures.js';
import { validateBacktest } from './validateBacktest.js';

function universes(context, originGroup) {
  return context.peerUniverses.map((item) => ({
    universeKey: `${item.key.segment || ''}|${item.key.type || ''}|${item.key.fuel || ''}|${originGroup || 'ALL'}`,
    segment: item.key.segment,
    type: item.key.type,
    fuel: item.key.fuel,
    originGroup: originGroup || null,
    targetModelIds: item.targetModelIds,
    models: item.totalModels,
    months: context.validation.months_returned,
  }));
}

export async function buildSignalBacktest(input = {}) {
  const scope = parseCompetitiveInput(input);
  const output = parseBacktestOutputInput(input);
  const context = await buildCompetitiveTrajectory(input);
  const pairSet = buildPairSeries(context, scope.originGroup);
  const summaries = pairSet.pairs.map(summarizePair);
  const requested = new Set(output.pairKeys);
  const detailPairs = output.outputMode === 'pair_detail'
    ? pairSet.pairs.filter((pair) => requested.has(pair.pairKey))
    : [];
  const detailByKey = new Map(detailPairs.map((pair) => [pair.pairKey, pairDetail(pair)]));
  const warnings = [...context.warnings];
  if (pairSet.missingTargetUniverses.length) warnings.push('TARGET_ENTITY_MISSING_IN_PEER_UNIVERSE');
  const matchedPairKeys = detailPairs.map((pair) => pair.pairKey);
  const missingPairKeys = output.pairKeys.filter((key) => !matchedPairKeys.includes(key));
  if (missingPairKeys.length) warnings.push('REQUESTED_PAIR_KEY_NOT_FOUND');
  const validation = validateBacktest({ context, scope, pairSet, summaries, detailByKey });
  validation.requested_pair_keys = output.pairKeys.length;
  validation.matched_pair_keys = matchedPairKeys.length;
  validation.detail_pair_keys_complete = missingPairKeys.length === 0;
  if (output.outputMode === 'pair_detail') validation.ok = validation.ok && validation.detail_pair_keys_complete;
  return {
    context: 'competitive_signal_backtest_v01',
    version: '0.1',
    scope: { ...context.scope, originGroup: scope.originGroup },
    output,
    targets: context.targets,
    universes: universes(context, scope.originGroup),
    summaries,
    detailByKey,
    coverage: {
      targets: context.targets.length,
      universes: pairSet.universeCount,
      pairs: pairSet.pairs.length,
      months: context.validation.months_returned,
    },
    validation,
    warnings: [...new Set(warnings)],
  };
}
