export function paretoInput(input = {}) {
  const universe = String(input.universe || 'ALL').toUpperCase();
  if (!['ALL', 'CHINA'].includes(universe)) throw new Error('universe must be ALL or CHINA');
  const threshold = input.threshold_pct == null ? 80 : Number(input.threshold_pct);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100) {
    throw new Error('threshold_pct must be greater than 0 and at most 100');
  }
  const clean = value => value == null || String(value).trim() === ''
    ? null : String(value).trim().toUpperCase();
  const period = clean(input.period);
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('period must be YYYY-MM');
  const segment = clean(input.segment);
  return {
    universe, threshold_pct: threshold, period,
    segment: segment === 'CAMIONETA' ? 'PICK-UP' : segment,
    brand: clean(input.brand),
  };
}
