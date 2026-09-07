import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DOMAIN_CAPABILITY_REGISTRY } from '../lib/custom-gpt-router.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expectedRom = [
  'business-rules.md',
  'catalog.md',
  'instructions.md',
  'intake.md',
  'orchestrator.md',
  'render-production.md',
  'render.md',
  'schema.json',
];
function schema() { return JSON.parse(readFileSync(join(root, 'rom/schema.json'), 'utf8')); }
const requestSchemaByDomain = Object.freeze({ SALES: 'SalesRequest', MARKET: 'MarketRequest', DISCOVERY: 'DiscoveryRequest', LONGITUDINAL: 'LongitudinalRequest' });
function capabilityCases(requestSchema) {
  return requestSchema.oneOf.map((entry) => ({ capability: entry.properties.capability.const, inputRef: entry.properties.input.$ref }));
}

test('domain registry and OpenAPI expose the same public capabilities through discriminated requests', () => {
  const value = schema();
  for (const [domain, requestSchema] of Object.entries(requestSchemaByDomain)) {
    const cases = capabilityCases(value.components.schemas[requestSchema]);
    const documented = cases.map((entry) => entry.capability);
    const registered = Object.keys(DOMAIN_CAPABILITY_REGISTRY[domain]);
    assert.deepEqual(new Set(documented), new Set(registered), domain);
    assert.equal(new Set(documented).size, documented.length, `${domain} contains duplicate capabilities`);
    assert.ok(cases.every((entry) => entry.inputRef?.startsWith('#/components/schemas/')), `${domain} case without input contract`);
  }
});

test('longitudinal OpenAPI separates VENTAS, RVM and CRM contracts', () => {
  const schemas = schema().components.schemas;
  const cases = Object.fromEntries(capabilityCases(schemas.LongitudinalRequest).map((entry) => [entry.capability, entry.inputRef]));
  assert.equal(cases.VENTAS, '#/components/schemas/VentasLongitudinalInput');
  assert.equal(cases.RVM, '#/components/schemas/RvmLongitudinalInput');
  assert.equal(cases.CRM, '#/components/schemas/CrmLongitudinalInput');

  assert.deepEqual(schemas.VentasLongitudinalInput.properties.metric.enum, [
    'VIN_SALES', 'SHARE_WITHIN_CIDEF', 'SHARE_WITHIN_COMMERCIAL_UNIVERSE', 'CHANNEL_MIX_WITHIN_CIDEF',
  ]);
  assert.deepEqual(schemas.RvmLongitudinalInput.properties.metric.enum, ['MARKET_SIZE', 'ENTITY_VIN', 'MARKET_SHARE', 'RANK']);
  assert.deepEqual(schemas.CrmLongitudinalInput.properties.metric.enum, [
    'LEADS_CREATED', 'SOLD', 'NOT_SOLD', 'MANAGED', 'UNMANAGED', 'MANAGEMENT_COVERAGE',
    'CONVERSION_ON_MANAGED', 'IN_MANAGEMENT', 'OPPORTUNITY', 'CLOSED', 'DESISTED', 'CONVERSION_RATE',
  ]);

  assert.ok(schemas.VentasLongitudinalInput.required.includes('commercial_universe'));
  assert.ok(schemas.CrmLongitudinalInput.required.includes('commercial_universe'));
  assert.ok(!schemas.RvmLongitudinalInput.properties.commercial_universe);
  assert.ok(!schemas.VentasLongitudinalInput.properties.organization_scope);
  assert.ok(!schemas.CrmLongitudinalInput.properties.organization_scope);
  assert.equal(schemas.RvmLongitudinalInput.properties.organization_scope.$ref, '#/components/schemas/OrganizationScope');
  assert.deepEqual(schemas.CrmLongitudinalInput.properties.commercial_universe.enum, ['COMPANY', 'OWN_STORES']);
});

test('vin growth diagnostic request is wired to its exact input contract', () => {
  const schemas = schema().components.schemas;
  const salesCases = Object.fromEntries(capabilityCases(schemas.SalesRequest).map((entry) => [entry.capability, entry.inputRef]));
  assert.equal(salesCases.VIN_GROWTH_DIAGNOSTIC, '#/components/schemas/VinGrowthDiagnosticInput');
  assert.deepEqual(schemas.VinGrowthDiagnosticInput.required, ['brand_id', 'store_id', 'current_month']);
  assert.equal(schemas.VinGrowthDiagnosticInput.additionalProperties, false);
  assert.equal(schemas.VinGrowthDiagnosticOutput.properties.motor.const, 'vin_growth_diagnostic_v01');
  assert.equal(schemas.VinGrowthDiagnosticOutput.properties.version.const, '0.1');
  assert.deepEqual(schemas.VinGrowthDiagnosticOutput.properties.status.enum, ['COMPLETE', 'PARTIAL']);
  assert.deepEqual(schemas.VinGrowthDiagnosticOutput.properties.scope.required, ['commercial_universe', 'organization_scope', 'store_id', 'brand_id']);
  assert.equal(schemas.VinGrowthDiagnosticOutput.properties.scope.properties.organization_scope.const, 'CIDEF');
  assert.equal(schemas.VinGrowthDiagnosticOutput.properties.rvm_context.properties.organization_scope.const, 'CIDEF');
  assert.deepEqual(schemas.Direction.enum, ['POSITIVE', 'NEGATIVE', 'FLAT', 'NOT_EVALUABLE']);
  assert.deepEqual(schemas.PctStatus.enum, ['EVALUABLE', 'NOT_EVALUABLE_ZERO_BASE', 'NOT_EVALUABLE_SOURCE']);
  assert.deepEqual(schemas.ActivityTransition.enum, ['NEW_ACTIVITY', 'CEASED_ACTIVITY', 'CONTINUING_ACTIVITY', 'NO_ACTIVITY']);
  assert.deepEqual(schemas.DiagnosticRelation.enum, ['SAME_DIRECTION', 'OPPOSITE_DIRECTION', 'STORE_MOVED_CONTEXT_FLAT', 'STORE_FLAT_CONTEXT_MOVED', 'BOTH_FLAT', 'NOT_EVALUABLE']);
});

test('RVM organization scope remains explicit and orthogonal in OpenAPI', () => {
  const schemas = schema().components.schemas;
  assert.deepEqual(schemas.OrganizationScope.enum, ['CIDEF', 'INDUMOTORA', 'MACO_TATTERSALL', 'ALL']);
  assert.deepEqual(schemas.OrganizationCoverageState.enum, ['RESOLVED', 'PARTIAL', 'NO_COVERAGE', 'AMBIGUOUS', 'NOT_EVALUABLE', 'NOT_APPLICABLE']);
  assert.equal(schemas.RvmLongitudinalInput.properties.organization_scope.$ref, '#/components/schemas/OrganizationScope');
  assert.match(schemas.RvmLongitudinalInput.description, /commercial_universe is not accepted/);
});

test('DISCOVERY AllowedTable matches backend catalog exactly', () => {
  const value = schema();
  const documented = value.components.schemas.AllowedTable.enum;
  const backendCatalog = [
    'vehiculos_raw', 'ventas_raw', 'notas_venta_raw', 'rvm_raw', 'CRM_Cidef_raw',
    'marcas_master_v01', 'modelos_master_v01', 'generaciones_master_v01', 'versiones_master_v01',
    'version_generation_v01', 'generation_evidence_v01', 'producto_aliases_v01',
    'producto_clasificacion_v01', 'producto_portafolio_v01', 'sucursales_master', 'sucursal_aliases',
    'dealer_groups', 'dealers_master', 'dealer_aliases', 'dealer_supervisor', 'personas_master',
    'persona_aliases', 'persona_roles', 'persona_sucursal', 'persona_estado_comercial', 'master_conflicts',
  ];
  assert.deepEqual(documented, backendCatalog);
});

test('ROM structure is atomic and exact', () => assert.deepEqual(readdirSync(join(root, 'rom')).sort(), expectedRom));
