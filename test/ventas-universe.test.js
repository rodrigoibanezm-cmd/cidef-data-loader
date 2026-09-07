import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductModelResolutionMap } from '../lib/product-model-resolution/buildResolutionMap.js';
import { resolveSalesModels } from '../lib/product-model-resolution/resolveSalesModels.js';
import { calculateVentasLongitudinal, parseVentasLongitudinalInput } from '../lib/longitudinal/ventas.js';
import {
  scopeRecognizedSalesToCommercialUniverse,
} from '../lib/ventas-commercial/buildVentasCommercialContext.js';
import { enrichRecognizedSales } from '../lib/ventas-org/enrichRecognizedSales.js';
import { resolveSalesProducts } from '../lib/ventas-product/resolveSaleProduct.js';
import {
  assembleVentasUniverse,
  enrichVentasUniverseEvents,
} from '../lib/ventas-universe/buildVentasUniverse.js';

const sales = [
  { source_id: 1, vin: 'OWN1', fecha_venta_iso: '2026-07-10T00:00:00.000Z', mes_venta: '2026-07', sucursal_source_key: 'RAW-OWN', vendedor_source_key: 'ana', producto_sku: 'MAGE-LUX', producto: 'MAGE LUX' },
  { source_id: 2, vin: 'DEALER1', fecha_venta_iso: '2026-07-11T00:00:00.000Z', mes_venta: '2026-07', sucursal_source_key: 'RAW-DEALER', vendedor_source_key: null, producto_sku: 'TM3', producto: 'TM3' },
  { source_id: 3, vin: 'UNKNOWN1', fecha_venta_iso: '2026-08-12T00:00:00.000Z', mes_venta: '2026-08', sucursal_source_key: null, vendedor_source_key: null, producto_sku: 'UNKNOWN', producto: 'UNKNOWN' },
];

const commercialMap = new Map([
  ['OWN1', { vin: 'OWN1', canal_salida: 'TIENDA_PROPIA', sucursal_venta_id: 7, sucursal_venta_nombre: 'BELLAVISTA', dealer_id: null, dealer_group_id: null, resolution_status: 'RESOLVED' }],
  ['DEALER1', { vin: 'DEALER1', canal_salida: 'DEALER', sucursal_venta_id: null, dealer_id: 22, dealer_nombre: 'DEALER A', dealer_group_id: 4, dealer_group_nombre: 'GROUP A', resolution_status: 'RESOLVED' }],
  ['UNKNOWN1', { vin: 'UNKNOWN1', canal_salida: null, sucursal_venta_id: null, dealer_id: null, dealer_group_id: null, resolution_status: 'UNRESOLVED' }],
]);

const aliases = [
  { valor_raw: 'MAGE-LUX', valor_normalizado: 'MAGE-LUX', modelo_id: 11, version_id: 111 },
  { valor_raw: 'TM3', valor_normalizado: 'TM3', modelo_id: 21, version_id: 211 },
];
const evidence = [
  { sku_raw: 'MAGE-LUX', sku_norm: 'MAGE-LUX', distinct_descriptions: 1, distinct_brands: 1, distinct_model_ids: 1, modelo_id: 11 },
  { sku_raw: 'TM3', sku_norm: 'TM3', distinct_descriptions: 1, distinct_brands: 1, distinct_model_ids: 1, modelo_id: 21 },
];
const organization = {
  stores: new Map([
    ['RAW-OWN', { canonical_id: 99, nombre_canonico: 'RAW OWN', tipo_canal: 'CIDEF', match_count: 1 }],
    ['RAW-DEALER', { canonical_id: 98, nombre_canonico: 'RAW DEALER', tipo_canal: 'DEALER', dealer_id: 22, dealer_group_id: 4, match_count: 1 }],
  ]),
  sellers: new Map([['ana', { canonical_id: 10, nombre_canonico: 'ANA', validated: true, match_count: 1 }]]),
  vendedorCidef: new Map([['10', [{ sucursal_id: 7, valid_from: '2026-01-01', valid_to: null, vigente: true }]]]),
  dealers: new Map([['22', { dealer_id: 22, nombre_canonico: 'DEALER A', dealer_group_id: 4, dealer_group_nombre: 'GROUP A' }]]),
};
const catalogs = {
  models: new Map([
    ['11', { modelo_id: 11, marca_id: 1, modelo: 'MAGE', marca: 'DONGFENG' }],
    ['21', { modelo_id: 21, marca_id: 2, modelo: 'TM3', marca: 'FOTON' }],
  ]),
  versions: new Map([
    ['111', { version_id: 111, modelo_id: 11, version: 'LUX' }],
    ['211', { version_id: 211, modelo_id: 21, version: 'STD' }],
  ]),
};
const resources = { organization, productAliases: aliases, skuEvidence: evidence, catalogs };

function commercial(universe) {
  return {
    ...scopeRecognizedSalesToCommercialUniverse({ recognizedSales: sales, commercialMap, universe }),
    source_context: {
      motor: 'ventas_context_v01', version: '0.3', cutoff_date: null, cutoff_month: '2026-08',
      coverage: { recognized_units: 3 }, validation: { ok: true }, warnings: [],
    },
  };
}

function parsed(extra = {}) {
  return parseVentasLongitudinalInput({
    metric: 'VIN_SALES', grain: 'TOTAL', commercial_universe: 'COMPANY',
    date_from: '2026-07-01', date_to: '2026-08-31', time_grain: 'MONTH', ...extra,
  });
}

test('ventas_universe_v01 reconciles COMPANY, OWN_STORES, DEALERS and unresolved residual', () => {
  const company = assembleVentasUniverse(commercial('COMPANY'), resources);
  const own = assembleVentasUniverse(commercial('OWN_STORES'), resources);
  const dealers = assembleVentasUniverse(commercial('DEALERS'), resources);

  assert.equal(company.analytical_events.length, 3);
  assert.equal(own.analytical_events.length, 1);
  assert.equal(dealers.analytical_events.length, 1);
  assert.equal(company.analytical_events.length,
    own.analytical_events.length + dealers.analytical_events.length
      + company.coverage.commercial.unresolved_channel);
  assert.equal(company.commercial_scope.authority, 'vehiculo_canonico');
  assert.equal(company.validation.valid, true);
  assert.equal(company.validation.commercial_counts_reconcile, true);
  assert.equal(company.validation.resolution_counts_reconcile, true);
  assert.equal(company.coverage.commercial.included_sales, 3);
});

test('central enrichment is field-equivalent to the former longitudinal assembly', () => {
  const context = commercial('OWN_STORES');
  const actual = enrichVentasUniverseEvents(context, resources).analyticalEvents;
  const exact = resolveSalesModels(
    context.sales,
    buildProductModelResolutionMap(evidence, aliases),
  );
  const aliasResolved = resolveSalesProducts(context.sales, aliases);
  const org = enrichRecognizedSales(context.sales, organization);
  const expected = exact.map((sale, index) => ({
    ...sale,
    ...org[index],
    version_id: aliasResolved[index].version_id,
    version_nombre: 'LUX',
    marca_id: 1,
    marca_nombre: 'DONGFENG',
    modelo_nombre: 'MAGE',
  }));
  const fields = ['vin', 'commercial_universe', 'canal_salida', 'sucursal_id', 'dealer_id',
    'persona_id', 'eligible_vendedor_cidef', 'product_identity_status', 'marca_id',
    'modelo_id', 'version_id', 'marca_nombre', 'modelo_nombre', 'version_nombre'];
  assert.deepEqual(actual.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))),
    expected.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))));
});

test('universe rows preserve product, version and date-effective VENDEDOR_CIDEF resolution', () => {
  const own = assembleVentasUniverse(commercial('OWN_STORES'), resources);
  const [event] = own.analytical_events;
  assert.deepEqual({ brand: event.marca_nombre, model: event.modelo_nombre, version: event.version_nombre },
    { brand: 'DONGFENG', model: 'MAGE', version: 'LUX' });
  assert.equal(event.sucursal_id, 7);
  assert.equal(event.persona_id, 10);
  assert.equal(event.eligible_vendedor_cidef, true);
  assert.equal(own.coverage.resolution.product_model.resolved, 1);
  assert.equal(own.coverage.resolution.product_version.resolved, 1);
});

test('longitudinal VIN, share, channel mix and domain grains calculate from certified universe rows', () => {
  const company = assembleVentasUniverse(commercial('COMPANY'), resources).analytical_events;
  const own = assembleVentasUniverse(commercial('OWN_STORES'), resources).analytical_events;
  const dealers = assembleVentasUniverse(commercial('DEALERS'), resources).analytical_events;

  assert.deepEqual(calculateVentasLongitudinal(company, parsed()).series.map((row) => row.value), [2, 1]);
  assert.equal(calculateVentasLongitudinal(company, parsed({ metric: 'SHARE_WITHIN_COMMERCIAL_UNIVERSE', grain: 'BRAND', filters: { brand: 'DONGFENG' } })).series[0].value, 0.5);
  assert.equal(calculateVentasLongitudinal(own, parsed({ metric: 'CHANNEL_MIX_WITHIN_CIDEF', commercial_universe: 'OWN_STORES' }), { denominatorEvents: company }).series[0].value, 0.5);
  assert.equal(calculateVentasLongitudinal(own, parsed({ commercial_universe: 'OWN_STORES', grain: 'STORE', filters: { store_id: 7 } })).series[0].value, 1);
  assert.equal(calculateVentasLongitudinal(dealers, parsed({ commercial_universe: 'DEALERS', grain: 'DEALER', filters: { dealer_id: 22 } })).series[0].value, 1);
  assert.equal(calculateVentasLongitudinal(own, parsed({ commercial_universe: 'OWN_STORES', grain: 'SELLER', filters: { seller_id: 10 } })).series[0].value, 1);
});

test('migrated longitudinal consumer contains no local RAW or MASTER reconstruction', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('../lib/longitudinal/ventas.js', import.meta.url), 'utf8'));
  assert.match(source, /buildVentasUniverse/);
  assert.doesNotMatch(source, /loadSkuEvidence|loadProductIdentityMap|loadOrganizationalIdentityMaps|enrichRecognizedSales|ventas_raw|sucursales_master/);
});

test('migrated organizational and product builders consume the universe without local loaders', async () => {
  const { readFile } = await import('node:fs/promises');
  const files = [
    '../lib/ventas-org/buildVentasOrganizationalContext.js',
    '../lib/product-model-resolution/buildContext.js',
    '../lib/ventas-product/buildVentasProductContext.js',
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /buildVentasUniverse/, file);
    assert.doesNotMatch(source, /buildVentasCommercialContext|loadOrganizationalIdentityMaps|loadProductIdentityMap|loadSkuEvidence|buildVentasContext/, file);
  }
});
