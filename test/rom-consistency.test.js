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
const requestSchemaByDomain = Object.freeze({ SALES: 'SalesRequest', MARKET: 'MarketRequest', CRM: 'CrmRequest', DISCOVERY: 'DiscoveryRequest', LONGITUDINAL: 'LongitudinalRequest' });
function requestCapabilities(schemas, requestSchema) {
  const request = schemas[requestSchema];
  if (request.properties?.capability?.enum) return request.properties.capability.enum;
  return request.oneOf.flatMap(({ $ref }) => {
    const branch = schemas[$ref.split('/').at(-1)];
    return branch.properties.capability.enum;
  });
}

test('domain registry and OpenAPI expose the same public capabilities', () => {
  const value = schema();
  for (const [domain, requestSchema] of Object.entries(requestSchemaByDomain)) {
    const documented = requestCapabilities(value.components.schemas, requestSchema);
    const registered = Object.keys(DOMAIN_CAPABILITY_REGISTRY[domain]);
    assert.deepEqual(new Set(documented), new Set(registered), domain);
    assert.equal(new Set(documented).size, documented.length, `${domain} contains duplicate capabilities`);
  }
});
test('vin growth diagnostic contract is explicit in OpenAPI', () => {
  const schemas = schema().components.schemas;
  assert.ok(schemas.SalesRequest.properties.capability.enum.includes('VIN_GROWTH_DIAGNOSTIC'));
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
test('RVM organization scope is explicit and orthogonal in OpenAPI', () => {
  const schemas = schema().components.schemas;
  assert.deepEqual(schemas.OrganizationScope.enum, ['CIDEF', 'INDUMOTORA', 'MACO_TATTERSALL', 'ALL']);
  assert.deepEqual(schemas.OrganizationCoverageState.enum, ['RESOLVED', 'PARTIAL', 'NO_COVERAGE', 'AMBIGUOUS', 'NOT_EVALUABLE', 'NOT_APPLICABLE']);
  assert.equal(schemas.LongitudinalInput.properties.organization_scope.$ref, '#/components/schemas/OrganizationScope');
  assert.match(schemas.LongitudinalInput.properties.organization_scope.description, /RVM only/);
  assert.ok(schemas.LongitudinalInput.properties.commercial_universe);
});
test('CRM context contract is explicit in OpenAPI', () => {
  const document = schema();
  const schemas = document.components.schemas;
  assert.equal(document.info.version, '1.59.0');
  assert.equal(schemas.CrmRequest.type, 'object');
  assert.equal('oneOf' in schemas.CrmRequest, false);
  assert.deepEqual(schemas.CrmRequest.required, ['capability', 'input']);
  assert.deepEqual(schemas.CrmRequest.properties.capability.enum, ['CONTEXT', 'LONGITUDINAL_CONTEXT']);
  assert.equal(schemas.CrmRequest.properties.input.type, 'object');
  assert.deepEqual(schemas.CrmRequest.properties.input.required, ['date_from', 'date_to']);
  assert.ok(Object.keys(schemas.CrmRequest.properties.input.properties).length > 0);
  assert.deepEqual(schemas.CrmRequest.example, {
    capability: 'CONTEXT',
    input: {
      commercial_universe: 'OWN_STORES', date_from: '2026-08-01', date_to: '2026-08-31',
      date_axis: 'ASSIGNED_AT', filters: {},
    },
  });
  assert.deepEqual(schemas.CrmContextRequest.properties.capability.enum, ['CONTEXT']);
  assert.equal(schemas.CrmContextRequest.properties.input.$ref, '#/components/schemas/CrmContextInput');
  assert.deepEqual(schemas.CrmContextRequest.example, {
    capability: 'CONTEXT',
    input: {
      commercial_universe: 'OWN_STORES', date_from: '2026-08-01', date_to: '2026-08-31',
      date_axis: 'ASSIGNED_AT', filters: {},
    },
  });
  assert.deepEqual(schemas.CrmLongitudinalContextRequest.properties.capability.enum, ['LONGITUDINAL_CONTEXT']);
  assert.equal(schemas.CrmLongitudinalContextRequest.properties.input.$ref, '#/components/schemas/CrmLongitudinalInput');
  assert.notEqual(schemas.CrmContextRequest.properties.input.$ref, schemas.CrmLongitudinalContextRequest.properties.input.$ref);
  assert.deepEqual(schemas.CrmContextInput.required, ['date_from', 'date_to']);
  assert.deepEqual(schemas.CrmContextInput.properties.commercial_universe.enum, ['OWN_STORES', 'COMPANY']);
  assert.equal(schemas.CrmContextInput.properties.commercial_universe.default, 'OWN_STORES');
  assert.deepEqual(schemas.CrmContextInput.properties.date_axis.enum, ['ASSIGNED_AT', 'CREATED_AT']);
  assert.equal(schemas.CrmContextInput.properties.date_axis.default, 'ASSIGNED_AT');
  assert.deepEqual(Object.keys(schemas.CrmContextFilterMap.properties), ['brand', 'product_interest', 'origin', 'suborigin', 'store']);
  assert.equal('seller' in schemas.CrmContextFilterMap.properties, false);
  assert.equal(schemas.CrmContextInput.properties.commercial_universe.enum.includes('DEALERS'), false);
  assert.equal(schemas.CrmContextInput.additionalProperties, false);
  assert.equal(schemas.CrmContextFilterMap.additionalProperties, false);
});
test('cidefCrm request body is an OpenAI Actions-compatible object with usable inputs', () => {
  const document = schema();
  const operation = document.paths['/api/custom-gpt/crm'].post;
  assert.equal(operation.operationId, 'cidefCrm');
  const bodyRef = operation.requestBody.content['application/json'].schema.$ref;
  const request = document.components.schemas[bodyRef.split('/').at(-1)];
  assert.equal(request.type, 'object');
  assert.equal('oneOf' in request, false);
  assert.ok(request.properties.capability);
  const input = request.properties.input;
  assert.equal(input.type, 'object');
  assert.ok(input.properties);
  for (const field of ['commercial_universe', 'date_from', 'date_to', 'date_axis', 'filters']) assert.ok(input.properties[field], field);
  assert.deepEqual(input.properties.commercial_universe.enum, ['OWN_STORES', 'COMPANY']);
  assert.equal(input.properties.commercial_universe.enum.includes('DEALERS'), false);
  assert.ok(input.properties.date_axis.enum.includes('ASSIGNED_AT'));
  assert.ok(input.properties.date_axis.enum.includes('CREATED_AT'));
  for (const field of ['metric', 'grain', 'time_grain', 'cutoff_date', 'cutoff_mode', 'breakdown', 'mode', 'cohort_axis']) assert.ok(input.properties[field], field);
  for (const field of ['brand', 'product_interest', 'origin', 'suborigin', 'store']) assert.ok(input.properties.filters.properties[field], field);
});
test('every local OpenAPI reference resolves', () => {
  const document = schema();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value.$ref?.startsWith('#/components/schemas/')) {
      assert.ok(document.components.schemas[value.$ref.split('/').at(-1)], value.$ref);
    }
    Object.values(value).forEach(visit);
  };
  visit(document);
});
test('ROM structure is atomic and exact', () => assert.deepEqual(readdirSync(join(root, 'rom')).sort(), expectedRom));
