import { enrichRecognizedSales } from '../ventas-org/enrichRecognizedSales.js';

function eventIdentity(event, grain) {
  if (grain === 'tienda') return {
    status: event.store_identity_status,
    id: event.sucursal_id,
    label: event.sucursal_nombre,
    rawKey: event.sucursal_source_key,
    validated: true,
  };
  return {
    status: event.seller_identity_status,
    id: event.persona_id,
    label: event.persona_nombre,
    rawKey: event.vendedor_source_key,
    validated: event.persona_validated !== false,
  };
}

export function aggregateRecognizedSales(context, grain, identityMaps) {
  const units = new Map();
  const coverage = { recognized: 0, resolved: 0, unresolved: 0, ambiguous: 0, unvalidated: 0 };
  const unresolvedKeys = new Set();
  const events = enrichRecognizedSales(context?.recognizedSales || [], identityMaps);
  for (const event of events) {
    coverage.recognized += 1;
    const identity = eventIdentity(event, grain);
    if (identity.status !== 'RESUELTA') {
      coverage[identity.status === 'AMBIGUA' ? 'ambiguous' : 'unresolved'] += 1;
      if (identity.rawKey != null) unresolvedKeys.add(String(identity.rawKey));
      continue;
    }
    coverage.resolved += 1;
    if (!identity.validated) coverage.unvalidated += 1;
    const key = String(identity.id);
    if (!units.has(key)) units.set(key, {
      unit_id: identity.id,
      unit_label: identity.label,
      identity_validated: identity.validated,
      months: new Map(),
    });
    const unit = units.get(key);
    unit.months.set(event.month, (unit.months.get(event.month) || 0) + 1);
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
