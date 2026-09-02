export function classifyObservationState(recognizedSales, nvCount) {
  if (recognizedSales > 0) return { state: 'OBSERVED_POSITIVE', sales: recognizedSales };
  if (nvCount > 0) return { state: 'ACTIVE_ZERO', sales: 0 };
  return { state: 'UNKNOWN', sales: null };
}
