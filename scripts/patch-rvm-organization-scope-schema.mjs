import { readFileSync, writeFileSync } from 'node:fs';

// One-shot patch kept deterministic so it can be removed after schema generation.
const path = 'rom/schema.json';
const schema = JSON.parse(readFileSync(path, 'utf8'));
const schemas = schema.components.schemas;

schema.info.version = '1.51.0';

schemas.OrganizationScope = {
  type: 'string',
  enum: ['CIDEF', 'INDUMOTORA', 'MACO_TATTERSALL', 'ALL'],
  description: 'RVM temporal commercial-organization scope. ALL disables organization filtering; it is not a MASTER organization.',
};

schemas.OrganizationCoverageState = {
  type: 'string',
  enum: ['RESOLVED', 'PARTIAL', 'NO_COVERAGE', 'AMBIGUOUS', 'NOT_EVALUABLE', 'NOT_APPLICABLE'],
};

const longitudinal = schemas.LongitudinalInput;
longitudinal.description = 'Shared longitudinal input for VENTAS, RVM and CRM. VENTAS and CRM require commercial_universe. Product-scoped RVM queries require explicit organization_scope; MARKET_SIZE remains organization_scope=ALL.';
longitudinal.properties.organization_scope = {
  $ref: '#/components/schemas/OrganizationScope',
  description: 'RVM only. Required when RVM filters/entity use BRAND or MODEL. Independent from commercial_universe.',
};

const output = schemas.VinGrowthDiagnosticOutput;
const scope = output.properties.scope;
scope.required = ['commercial_universe', 'organization_scope', 'store_id', 'brand_id'];
scope.properties.organization_scope = { type: 'string', const: 'CIDEF' };

const rvm = output.properties.rvm_context;
rvm.properties.organization_scope = { type: 'string', const: 'CIDEF' };
rvm.properties.organization_resolution_state = { $ref: '#/components/schemas/OrganizationCoverageState' };
rvm.properties.organization_coverage = {
  type: ['object', 'null'],
  properties: {
    scope: { $ref: '#/components/schemas/OrganizationScope' },
    state: { $ref: '#/components/schemas/OrganizationCoverageState' },
    included: { type: 'number' },
    excludedOtherOrganization: { type: 'number' },
    unresolved: { type: 'number' },
    ambiguous: { type: 'number' },
    total: { type: 'number' },
  },
  additionalProperties: false,
};

writeFileSync(path, `${JSON.stringify(schema)}\n`);
