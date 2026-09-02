import { buildSignalBacktest } from '../competitive-signal-backtest/buildSignalBacktest.js';
import { parseRelationInput, signalBacktestInput } from './relationInput.js';
import { projectRelations } from './projectRelations.js';
import { COMPETITIVE_RELATION_RULE } from './rule.js';
import { validateRelations } from './validateRelations.js';

export async function buildCompetitiveRelations(input = {}) {
  const parsed = parseRelationInput(input);
  const context = await buildSignalBacktest(signalBacktestInput(parsed));
  const projection = projectRelations(context, parsed);
  const validation = validateRelations({ context, projection });
  const totalPairs = context.coverage.pairs;
  const selectedPairs = projection.selectedTotal;
  return {
    context: 'competitive_relation_v01',
    version: '0.1',
    scope: context.scope,
    rule: {
      name: COMPETITIVE_RELATION_RULE.name,
      version: COMPETITIVE_RELATION_RULE.version,
      maxMedianShareGapPp: COMPETITIVE_RELATION_RULE.maxMedianShareGapPp,
      minJointActiveMonths: COMPETITIVE_RELATION_RULE.minJointActiveMonths,
      minCrossings: COMPETITIVE_RELATION_RULE.minCrossings,
      logicalForm: 'ALL',
    },
    targets: context.targets,
    universes: context.universes,
    relations: projection.relations,
    selectedByTarget: projection.selectedCountsByTarget,
    page: projection.page,
    coverage: {
      ...context.coverage,
      totalPairs,
      selectedPairs,
      rejectedPairs: totalPairs - selectedPairs,
      selectedRate: totalPairs ? selectedPairs / totalPairs : 0,
    },
    validation,
    warnings: context.warnings,
  };
}
