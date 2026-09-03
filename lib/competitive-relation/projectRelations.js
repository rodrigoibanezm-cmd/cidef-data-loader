import { COMPETITIVE_RELATION_RULE, evaluateCompetitiveRelation } from './rule.js';

function compactRelation(summary) {
  return {
    pairKey: summary.pairKey,
    targetModelId: summary.target.modelId,
    peer: {
      entityKey: summary.peer.entityKey,
      modelId: summary.peer.modelId,
      identityStatus: summary.peer.identityStatus,
      brand: summary.peer.brand,
      model: summary.peer.model,
    },
    universeKey: summary.universe.universeKey,
    evidence: {
      medianShareGapPp: summary.shareGap.medianPp,
      jointActiveMonths: summary.continuity.jointActiveMonths,
      crossings: summary.crossings.count,
    },
    relation: 'COMPETITIVE_RELATION',
    ruleVersion: COMPETITIVE_RELATION_RULE.version,
  };
}

export function selectCompetitiveRelationSummaries(context) {
  return context.summaries
    .filter((summary) => evaluateCompetitiveRelation(summary).selected);
}

function selectedCountsByTarget(selected) {
  const counts = new Map();
  for (const summary of selected) {
    const id = summary.target.modelId;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([targetModelId, selectedRelations]) => ({ targetModelId, selectedRelations }));
}

export function projectRelations(context, { pairOffset, pairLimit }) {
  const selected = selectCompetitiveRelationSummaries(context)
    .sort((a, b) => a.pairKey.localeCompare(b.pairKey));
  const pageRows = selected.slice(pairOffset, pairOffset + pairLimit);
  const nextOffset = pairOffset + pageRows.length;
  return {
    relations: pageRows.map(compactRelation),
    selectedCountsByTarget: selectedCountsByTarget(selected),
    page: {
      pairOffset,
      pairLimit,
      totalRelations: selected.length,
      returnedRelations: pageRows.length,
      hasMore: nextOffset < selected.length,
      nextOffset: nextOffset < selected.length ? nextOffset : null,
    },
    selectedTotal: selected.length,
  };
}
