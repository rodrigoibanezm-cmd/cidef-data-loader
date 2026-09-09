import { MOVEMENT } from '../competitive-inverse-share-movement/buildPairMovement.js';

export { MOVEMENT };

export function safeGrowth(current, comparable) {
  if (Number(comparable) === 0) return { value: null, status: 'ZERO_BASE' };
  return { value: (Number(current) - Number(comparable)) / Number(comparable), status: 'EVALUABLE' };
}

export function movementFor(subjectShareChangePp, competitorShareChangePp) {
  if (subjectShareChangePp > 0 && competitorShareChangePp < 0) return MOVEMENT.TARGET_GAIN_PEER_LOSS;
  if (subjectShareChangePp < 0 && competitorShareChangePp > 0) return MOVEMENT.TARGET_LOSS_PEER_GAIN;
  if ((subjectShareChangePp > 0 && competitorShareChangePp > 0)
    || (subjectShareChangePp < 0 && competitorShareChangePp < 0)) return MOVEMENT.SAME_DIRECTION;
  return MOVEMENT.FLAT_OR_ONE_SIDED;
}

export function transferMetrics({ subjectCurrent, subjectComparable, competitorCurrent, competitorComparable, marketCurrent, marketComparable }) {
  const subjectShareCurrent = marketCurrent === 0 ? null : subjectCurrent / marketCurrent;
  const subjectShareComparable = marketComparable === 0 ? null : subjectComparable / marketComparable;
  const competitorShareCurrent = marketCurrent === 0 ? null : competitorCurrent / marketCurrent;
  const competitorShareComparable = marketComparable === 0 ? null : competitorComparable / marketComparable;
  const subjectShareChangePp = subjectShareCurrent == null || subjectShareComparable == null
    ? null : 100 * (subjectShareCurrent - subjectShareComparable);
  const competitorShareChangePp = competitorShareCurrent == null || competitorShareComparable == null
    ? null : 100 * (competitorShareCurrent - competitorShareComparable);
  const subjectVinChangeAbs = subjectCurrent - subjectComparable;
  const competitorVinChangeAbs = competitorCurrent - competitorComparable;
  const movement = subjectShareChangePp == null || competitorShareChangePp == null
    ? null : movementFor(subjectShareChangePp, competitorShareChangePp);
  const inverseDirectionFlag = movement === MOVEMENT.TARGET_GAIN_PEER_LOSS
    || movement === MOVEMENT.TARGET_LOSS_PEER_GAIN;
  const inverseVin = subjectVinChangeAbs * competitorVinChangeAbs < 0;
  const subjectGrowth = safeGrowth(subjectCurrent, subjectComparable);
  const competitorGrowth = safeGrowth(competitorCurrent, competitorComparable);
  return {
    subject_vin: subjectCurrent,
    competitor_vin: competitorCurrent,
    market_vin: marketCurrent,
    comparable_subject_vin: subjectComparable,
    comparable_competitor_vin: competitorComparable,
    comparable_market_vin: marketComparable,
    subject_share: subjectShareCurrent,
    competitor_share: competitorShareCurrent,
    comparable_subject_share: subjectShareComparable,
    comparable_competitor_share: competitorShareComparable,
    subject_vin_change_abs: subjectVinChangeAbs,
    competitor_vin_change_abs: competitorVinChangeAbs,
    subject_growth_pct: subjectGrowth.value,
    competitor_growth_pct: competitorGrowth.value,
    subject_growth_status: subjectGrowth.status,
    competitor_growth_status: competitorGrowth.status,
    subject_share_change_pp: subjectShareChangePp,
    competitor_share_change_pp: competitorShareChangePp,
    inverse_direction_flag: inverseDirectionFlag,
    movement,
    inverse_share_change_magnitude: inverseDirectionFlag
      ? Math.min(Math.abs(subjectShareChangePp), Math.abs(competitorShareChangePp)) : 0,
    inverse_vin_change_magnitude: inverseVin
      ? Math.min(Math.abs(subjectVinChangeAbs), Math.abs(competitorVinChangeAbs)) : null,
  };
}

export function persistenceFor(periodsObserved, inversePeriods, minPeriods, minRatio) {
  const ratio = periodsObserved ? inversePeriods / periodsObserved : null;
  let status = inversePeriods === 0 ? 'NONE'
    : inversePeriods === 1 ? 'SINGLE_OBSERVATION' : 'REPEATED_OBSERVATION';
  if (minPeriods != null && minRatio != null
    && inversePeriods >= minPeriods && ratio >= minRatio) status = 'PERSISTENT';
  return { periods_observed: periodsObserved, inverse_periods: inversePeriods, inverse_consistency_ratio: ratio, persistence_status: status };
}
