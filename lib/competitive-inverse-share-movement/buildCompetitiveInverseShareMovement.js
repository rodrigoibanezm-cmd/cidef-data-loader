import { buildSignalBacktest } from '../competitive-signal-backtest/buildSignalBacktest.js';
import { signalBacktestInput } from '../competitive-relation/relationInput.js';
import { selectCompetitiveRelationSummaries } from '../competitive-relation/projectRelations.js';
import { COMPETITIVE_RELATION_RULE } from '../competitive-relation/rule.js';
import { buildPairInverseShareMovement } from './buildPairMovement.js';
import { parseInverseShareMovementInput } from './movementInput.js';
import { projectInverseShareMovements } from './projectMovements.js';
import { validateInverseShareMovements } from './validateMovements.js';

export async function buildCompetitiveInverseShareMovement(input = {}) {
  const parsed = parseInverseShareMovementInput(input);
  const context = await buildSignalBacktest(signalBacktestInput(parsed));
  const selectedSummaries = selectCompetitiveRelationSummaries(context);
  const pairsByKey = new Map(context.pairSeries.map((pair) => [pair.pairKey, pair]));
  const rows = selectedSummaries.map((summary) => (
    buildPairInverseShareMovement(pairsByKey.get(summary.pairKey), summary, parsed.scope)
  ));
  const projection = projectInverseShareMovements(rows, parsed);
  const validation = validateInverseShareMovements({
    context, parsed, selectedSummaries, rows, projection,
  });
  const warnings = [...context.warnings];
  if (!selectedSummaries.length) warnings.push('NO_COMPETITIVE_RELATIONS_IN_REQUESTED_PERIOD');
  const evaluableTransitions = rows.reduce((sum, row) => sum + row.jointEvaluableTransitions, 0);

  return {
    context: 'competitive_inverse_share_movement_v01',
    version: '0.1',
    scope: context.scope,
    relationRule: { ...COMPETITIVE_RELATION_RULE },
    targets: context.targets,
    universes: context.universes,
    movements: projection.movements,
    page: projection.page,
    coverage: {
      ...context.coverage,
      totalPairs: context.coverage.pairs,
      relatedPairs: selectedSummaries.length,
      rejectedPairs: context.coverage.pairs - selectedSummaries.length,
      candidateTransitions: rows.reduce((sum, row) => sum + row.candidateTransitions, 0),
      jointEvaluableTransitions: evaluableTransitions,
      totalRelations: projection.page.totalRelations,
      eligibleRelations: projection.page.eligibleRelations,
      excludedByMinEvidence: projection.page.excludedByMinEvidence,
      returnedRelations: projection.page.returnedRelations,
    },
    validation,
    warnings: [...new Set(warnings)],
  };
}
