function assertFiniteValues(values) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new TypeError('values must contain only finite numbers');
  }
}

function assertPercentile(percentileValue) {
  if (typeof percentileValue !== 'number' || !Number.isFinite(percentileValue)
      || percentileValue < 0 || percentileValue > 100) {
    throw new RangeError('percentile must be a finite number between 0 and 100');
  }
}

export function percentile(values, percentileValue) {
  assertFiniteValues(values);
  assertPercentile(percentileValue);
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const h = (sorted.length - 1) * percentileValue / 100;
  const lowerIndex = Math.floor(h);
  const upperIndex = Math.ceil(h);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];

  const weight = h - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

export function median(values) {
  return percentile(values, 50);
}
