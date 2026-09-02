export const COMPETITIVE_RELATION_RULE = Object.freeze({
  name: 'COMPETITIVE_RELATION_V01',
  version: '0.1',
  maxMedianShareGapPp: 3,
  minJointActiveMonths: 6,
  minCrossings: 1,
});

export function evaluateCompetitiveRelation(summary) {
  const medianGap = summary?.shareGap?.medianPp;
  const jointActive = summary?.continuity?.jointActiveMonths;
  const crossings = summary?.crossings?.count;
  const proximity = Number.isFinite(medianGap)
    && medianGap <= COMPETITIVE_RELATION_RULE.maxMedianShareGapPp;
  const continuity = Number.isInteger(jointActive)
    && jointActive >= COMPETITIVE_RELATION_RULE.minJointActiveMonths;
  const alternation = Number.isInteger(crossings)
    && crossings >= COMPETITIVE_RELATION_RULE.minCrossings;
  return {
    selected: proximity && continuity && alternation,
    checks: { proximity, continuity, alternation },
  };
}
