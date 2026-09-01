import { resolveOrgSale } from './orgIdentityMaps.js';

export function aggregateRecognizedSales(context, grain, identities) {
  const units = new Map();
  const coverage = { recognized: 0, resolved: 0, unresolved: 0, unvalidated: 0 };
  const unresolvedKeys = new Set();
  for (const sale of context?.recognizedSales || []) {
    coverage.recognized += 1;
    const identity = resolveOrgSale(sale, grain, identities);
    if (!identity.resolved) {
      coverage.unresolved += 1;
      if (identity.rawKey) unresolvedKeys.add(identity.rawKey);
      continue;
    }
    coverage.resolved += 1;
    if (!identity.identityValidated) coverage.unvalidated += 1;
    const key = String(identity.unitId);
    if (!units.has(key)) {
      units.set(key, {
        unit_id: identity.unitId,
        unit_label: identity.unitLabel,
        identity_validated: identity.identityValidated,
        months: new Map(),
      });
    }
    const unit = units.get(key);
    unit.months.set(sale.mes_venta, (unit.months.get(sale.mes_venta) || 0) + 1);
  }
  return { units, coverage, unresolvedKeys: [...unresolvedKeys].sort() };
}

export function observedValue(unit, month) {
  if (!unit) return 0;
  return unit.months.get(month) || 0;
}

export function firstObservedMonth(unit) {
  const months = [...(unit?.months?.keys() || [])].sort();
  return months[0] || null;
}

export function valueWithObservedZero(unit, month) {
  const first = firstObservedMonth(unit);
  if (!first || month < first) return null;
  return observedValue(unit, month);
}
