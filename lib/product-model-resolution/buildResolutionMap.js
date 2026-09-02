import { normalizeProductKey } from './normalize.js';

function indexAliases(aliasRows = []) {
  const index = new Map();
  for (const row of aliasRows) {
    const key = normalizeProductKey(row.valor_normalizado || row.valor_raw);
    if (!key) continue;
    if (!index.has(key)) index.set(key, new Set());
    if (Number.isFinite(Number(row.modelo_id))) index.get(key).add(Number(row.modelo_id));
  }
  return index;
}

function evidenceStatus(row) {
  if (!row) return 'UNRESOLVED';
  if (Number(row.distinct_descriptions) !== 1 || Number(row.distinct_brands) !== 1) return 'AMBIGUOUS';
  if (Number(row.ambiguous_vins) > 0 || Number(row.distinct_model_ids) > 1) return 'AMBIGUOUS';
  if (Number(row.distinct_model_ids) === 1 && Number(row.modelo_id) > 0) return 'RESOLVED';
  return 'UNRESOLVED';
}

export function buildProductModelResolutionMap(evidenceRows = [], aliasRows = []) {
  const direct = indexAliases(aliasRows);
  const result = new Map();

  for (const row of evidenceRows) {
    const key = normalizeProductKey(row.sku_norm || row.sku_raw);
    const directModels = [...(direct.get(key) || [])];
    const fallbackStatus = evidenceStatus(row);
    let status = fallbackStatus;
    let modeloId = fallbackStatus === 'RESOLVED' ? Number(row.modelo_id) : null;
    let method = modeloId ? 'EXACT_VIN_EVIDENCE' : null;

    if (directModels.length === 1) {
      status = 'RESOLVED';
      modeloId = directModels[0];
      method = 'CERTIFIED_VENTAS_ALIAS';
    } else if (directModels.length > 1) {
      status = 'AMBIGUOUS';
      modeloId = null;
      method = 'CERTIFIED_ALIAS_CONFLICT';
    }

    result.set(key, {
      sku: row.sku_raw,
      desc_articulo: row.desc_articulo,
      marca_raw: row.marca_raw,
      status,
      modelo_id: modeloId,
      resolution_method: method,
      raw_rows: Number(row.raw_rows || 0),
      observed_vins: Number(row.observed_vins || 0),
      canonical_vins: Number(row.canonical_vins || 0),
      rvm_vins: Number(row.rvm_vins || 0),
      ambiguous_vins: Number(row.ambiguous_vins || 0),
      no_evidence_vins: Number(row.no_evidence_vins || 0),
      source_conflict_vins: Number(row.source_conflict_vins || 0),
    });
  }

  for (const [key, models] of direct.entries()) {
    if (result.has(key)) continue;
    const ids = [...models];
    result.set(key, {
      sku: key, desc_articulo: null, marca_raw: null,
      status: ids.length === 1 ? 'RESOLVED' : 'AMBIGUOUS',
      modelo_id: ids.length === 1 ? ids[0] : null,
      resolution_method: ids.length === 1 ? 'CERTIFIED_VENTAS_ALIAS' : 'CERTIFIED_ALIAS_CONFLICT',
      raw_rows: 0, observed_vins: 0, canonical_vins: 0, rvm_vins: 0,
      ambiguous_vins: 0, no_evidence_vins: 0, source_conflict_vins: 0,
    });
  }

  return result;
}
