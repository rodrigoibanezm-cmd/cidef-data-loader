import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductModelResolutionMap } from '../lib/product-model-resolution/buildResolutionMap.js';
import { resolveSaleModel } from '../lib/product-model-resolution/resolveSalesModels.js';

const baseEvidence = {
  sku_norm: 'G7 2.0L MT 4X4 E6 LITE', sku_raw: 'G7 2.0L MT 4X4 E6 LITE',
  desc_articulo: 'G7 2.0L MT 4X4 E6 LITE', marca_raw: 'FOTON', raw_rows: 100,
  distinct_descriptions: 1, distinct_brands: 1, distinct_model_ids: 1, modelo_id: 28,
  observed_vins: 20, canonical_vins: 0, rvm_vins: 20, ambiguous_vins: 0,
  no_evidence_vins: 80, source_conflict_vins: 0,
};

test('resolves SKU when exact VIN evidence converges to one model', () => {
  const map = buildProductModelResolutionMap([baseEvidence], []);
  const row = map.get('G7 2.0L MT 4X4 E6 LITE');
  assert.equal(row.status, 'RESOLVED');
  assert.equal(row.modelo_id, 28);
  assert.equal(row.resolution_method, 'EXACT_VIN_EVIDENCE');
});

test('rejects a SKU when exact evidence reaches multiple models', () => {
  const map = buildProductModelResolutionMap([{ ...baseEvidence, distinct_model_ids: 2, modelo_id: 28 }], []);
  assert.equal(map.get('G7 2.0L MT 4X4 E6 LITE').status, 'AMBIGUOUS');
});

test('rejects unresolved RVM ambiguity instead of majority voting', () => {
  const map = buildProductModelResolutionMap([{ ...baseEvidence, ambiguous_vins: 1 }], []);
  const row = map.get('G7 2.0L MT 4X4 E6 LITE');
  assert.equal(row.status, 'AMBIGUOUS');
  assert.equal(row.modelo_id, null);
});

test('certified ventas alias has precedence over fallback evidence', () => {
  const aliases = [{ valor_normalizado: baseEvidence.sku_norm, modelo_id: 481 }];
  const map = buildProductModelResolutionMap([baseEvidence], aliases);
  const row = map.get('G7 2.0L MT 4X4 E6 LITE');
  assert.equal(row.status, 'RESOLVED');
  assert.equal(row.modelo_id, 481);
  assert.equal(row.resolution_method, 'CERTIFIED_VENTAS_ALIAS');
});

test('sale resolution uses technical SKU only, never description substring', () => {
  const map = buildProductModelResolutionMap([baseEvidence], []);
  const sale = { producto_sku: 'OTHER SKU', producto: 'G7 2.0L MT 4X4 E6 LITE' };
  const resolved = resolveSaleModel(sale, map);
  assert.equal(resolved.product_identity_status, 'UNRESOLVED');
  assert.equal(resolved.modelo_id, null);
});
