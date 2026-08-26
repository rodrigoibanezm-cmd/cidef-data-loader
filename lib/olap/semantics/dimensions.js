import { VIN_CUBE } from '../vin-cube-registry.js';
import { normalizeText } from '../vin-normalizers.js';
import {
  booleanSql,
  normalizedTextSql,
  quoteIdentifier,
} from '../query/sql-utils.js';

export function dealerIndex(rows) {
  const dealers = new Map();
  for (const row of rows) {
    dealers.set(normalizeText(row.dealer), {
      id:String(row.dealer_id),
      supervisor:row.supervisor ?? null,
    });
  }
  return dealers;
}

export function dimensionValue(row, dimension, dealers) {
  const definition = VIN_CUBE.dimensions[dimension.name];
  if (dimension.name === 'dealer_supervisor') {
    const dealer = dealers.get(normalizeText(row.dealer_venta));
    const raw = dealer?.supervisor ?? null;
    return dimension.level === 'raw'
      ? (raw == null ? null : String(raw).trim() || null)
      : normalizeText(raw);
  }
  const raw = row[definition.column]
    ?? (definition.fallbackColumn ? row[definition.fallbackColumn] : null);
  if (dimension.name === 'dealer_sale' && dimension.level === 'canonical') {
    const normalized = normalizeText(raw);
    if (!normalized) return '__MISSING__';
    return dealers.get(normalized)?.id ?? '__UNMATCHED__';
  }
  if (definition.type === 'boolean') {
    if (raw == null || String(raw).trim() === '') return null;
    const value = String(raw).trim().toLowerCase();
    if (['1','true','t','yes','si','sí'].includes(value)) return true;
    if (['0','false','f','no'].includes(value)) return false;
    return null;
  }
  if (definition.type === 'numeric') {
    return raw == null || String(raw).trim() === ''
      ? null : Number(String(raw).replace(/[^0-9.-]/g,''));
  }
  if (dimension.level === 'normalized') return normalizeText(raw);
  return raw == null || String(raw).trim() === '' ? null : String(raw).trim();
}

export function dimensionSql(dimension, alias = 'i') {
  const definition = VIN_CUBE.dimensions[dimension.name];
  if (dimension.name === 'dealer_sale' && dimension.level === 'canonical') {
    return `CASE WHEN NULLIF(TRIM(${alias}.dealer_venta::text),'') IS NULL THEN '__MISSING__' WHEN d.dealer_id IS NULL THEN '__UNMATCHED__' ELSE d.dealer_id::text END`;
  }
  if (dimension.name === 'dealer_supervisor') {
    const source = `d.${quoteIdentifier(definition.masterColumn)}`;
    return dimension.level === 'raw'
      ? `NULLIF(TRIM(${source}::text),'')` : normalizedTextSql(source);
  }
  const raw = `${alias}.${quoteIdentifier(definition.column)}`;
  if (definition.type === 'boolean') return booleanSql(raw);
  if (definition.type === 'numeric') {
    return `NULLIF(REGEXP_REPLACE(${raw}::text,'[^0-9.-]','','g'),'')::numeric`;
  }
  return dimension.level === 'normalized'
    ? normalizedTextSql(raw) : `NULLIF(TRIM(${raw}::text),'')`;
}

export function needsDealerJoin(input) {
  const dimensions = [
    ...(input.dimensions || []),
    ...(input.filters || []).map((filter) => filter.field)
      .filter((field) => field?.type === 'dimension'),
  ];
  return dimensions.some((dimension) =>
    dimension.name === 'dealer_supervisor'
    || (dimension.name === 'dealer_sale' && dimension.level === 'canonical'));
}

export function sourceFromSql(input) {
  if (!needsDealerJoin(input)) return `"${VIN_CUBE.source}" i`;
  return `"${VIN_CUBE.source}" i LEFT JOIN dealers_master d ON d.activo IS TRUE AND d.tipo='DEALER' AND ${normalizedTextSql('d.dealer')} = ${normalizedTextSql('i.dealer_venta')}`;
}
