import { getMarketBrandOrigin } from '../market-origin/loadMarketOrigin.js';
import { monthLabels } from './monthRange.js';

const num = (value) => Number(value ?? 0);
const text = (value) => String(value || '');

function universeKey(row) {
  return `${row.segment_key ?? ''}|${row.type_key ?? ''}|${row.fuel_key ?? ''}`;
}

function normalize(row) {
  return {
    month: row.month,
    universeKey: universeKey(row),
    universe: { segment: row.segment ?? null, type: row.type ?? null, fuel: row.fuel ?? null },
    targetModelIds: (row.target_model_ids || []).map(Number),
    entityKey: row.entity_key,
    modelId: row.model_id == null ? null : Number(row.model_id),
    identityStatus: row.identity_status,
    brand: row.brand ?? null,
    model: row.model ?? null,
    rvmBrand: row.rvm_brand ?? null,
    rvmModel: row.rvm_model ?? null,
    units: num(row.units),
    rowCount: num(row.row_count),
    marketOrigin: getMarketBrandOrigin(row.brand ?? row.rvm_brand),
  };
}

function allowed(row, originGroup) {
  return !originGroup || row.marketOrigin.originGroup === originGroup;
}

function rankMonth(rows) {
  const sorted = [...rows].sort((a, b) => num(b.units) - num(a.units)
    || text(a.brand).localeCompare(text(b.brand))
    || text(a.model).localeCompare(text(b.model))
    || text(a.entityKey).localeCompare(text(b.entityKey)));
  const totalUnits = sorted.reduce((sum, row) => sum + num(row.units), 0);
  let cumulative = 0;
  return sorted.map((row, index) => {
    cumulative += num(row.units);
    return {
      ...row,
      totalUnits,
      rank: row.observed ? index + 1 : null,
      share: totalUnits ? num(row.units) / totalUnits : null,
      cumulativeShare: row.observed && totalUnits ? cumulative / totalUnits : null,
    };
  });
}

export function assembleMonthlyRows(scope, rawRows = []) {
  const months = monthLabels(scope.dateFrom, scope.dateTo);
  const universes = new Map();
  for (const raw of rawRows.map(normalize).filter((row) => allowed(row, scope.originGroup))) {
    if (!universes.has(raw.universeKey)) universes.set(raw.universeKey, { entities: new Map(), observed: new Map() });
    const universe = universes.get(raw.universeKey);
    universe.entities.set(raw.entityKey, raw);
    universe.observed.set(`${raw.month}|${raw.entityKey}`, raw);
  }

  const rows = [];
  for (const universe of universes.values()) {
    for (const month of months) {
      const dense = [...universe.entities.values()].map((prototype) => {
        const observed = universe.observed.get(`${month}|${prototype.entityKey}`);
        return observed
          ? { ...observed, observed: true }
          : { ...prototype, month, units: 0, rowCount: 0, observed: false };
      });
      rows.push(...rankMonth(dense));
    }
  }
  return { months, rows, universeCount: universes.size };
}
