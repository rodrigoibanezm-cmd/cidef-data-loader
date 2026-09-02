const RULES = {
  tienda: {
    name: 'median_3',
    type: 'median',
    window: 3,
    lag: 3,
    actual_share: 'share_of_cidef',
  },
  vendedor: {
    name: 'moving_average_5',
    type: 'moving_average',
    window: 5,
    lag: 5,
    actual_share: 'share_of_store',
  },
};

export const CERTIFIED_RELATIVE_RULES = Object.freeze({
  tienda: Object.freeze(RULES.tienda),
  vendedor: Object.freeze(RULES.vendedor),
});

export function getCertifiedRelativeRule(grain) {
  const rule = CERTIFIED_RELATIVE_RULES[grain];
  if (!rule) throw new Error('grain must be tienda or vendedor');
  return rule;
}
