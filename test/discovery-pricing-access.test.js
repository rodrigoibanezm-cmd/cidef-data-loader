import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAW_TABLES,
  MASTER_TABLES,
  PRICING_TABLES,
  CUSTOM_GPT_TABLES,
  assertTable,
} from '../lib/custom-gpt/catalog.js';
import { listTables } from '../lib/custom-gpt/tableMetadata.js';

const EXPECTED_RAW_TABLES = [
  'vehiculos_raw',
  'ventas_raw',
  'notas_venta_raw',
  'rvm_raw',
  'CRM_Cidef_raw',
];

const EXPECTED_MASTER_TABLES = [
  'marcas_master_v01',
  'modelos_master_v01',
  'generaciones_master_v01',
  'versiones_master_v01',
  'version_generation_v01',
  'generation_evidence_v01',
  'producto_aliases_v01',
  'producto_clasificacion_v01',
  'producto_portafolio_v01',
  'sucursales_master',
  'sucursal_aliases',
  'dealer_groups',
  'dealers_master',
  'dealer_aliases',
  'dealer_supervisor',
  'personas_master',
  'persona_aliases',
  'persona_roles',
  'persona_sucursal',
  'persona_estado_comercial',
  'master_conflicts',
];

test('catalog exposes pricing tables without changing RAW or MASTER', () => {
  assert.deepEqual(RAW_TABLES, EXPECTED_RAW_TABLES);
  assert.deepEqual(MASTER_TABLES, EXPECTED_MASTER_TABLES);
  assert.deepEqual(PRICING_TABLES, ['price_versions', 'price_history']);
  assert.deepEqual(CUSTOM_GPT_TABLES, [
    ...EXPECTED_RAW_TABLES,
    ...EXPECTED_MASTER_TABLES,
    ...PRICING_TABLES,
  ]);
});

test('assertTable accepts pricing tables and rejects non-allowlisted tables', () => {
  assert.equal(assertTable('price_versions'), 'price_versions');
  assert.equal(assertTable('price_history'), 'price_history');
  assert.throws(() => assertTable('pricing_universe_v01'), /Table not allowed/);
});

test('LIST_TABLES exposes pricing and all contains pricing', async () => {
  const tables = await listTables();
  assert.deepEqual(tables.raw, EXPECTED_RAW_TABLES);
  assert.deepEqual(tables.master, EXPECTED_MASTER_TABLES);
  assert.deepEqual(tables.pricing, ['price_versions', 'price_history']);
  assert.deepEqual(tables.all, CUSTOM_GPT_TABLES);
});
