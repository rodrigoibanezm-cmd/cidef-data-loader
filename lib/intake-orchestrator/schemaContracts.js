import schema from '../../rom/schema.json' with { type: 'json' };

const REQUEST_SCHEMA = Object.freeze({
  SALES: 'SalesRequest',
  MARKET: 'MarketRequest',
  CRM: 'CrmRequest',
  LONGITUDINAL: 'LongitudinalRequest',
  DISCOVERY: 'DiscoveryRequest',
});

function dereference(value) {
  if (!value?.$ref) return value;
  const name = value.$ref.split('/').at(-1);
  const resolved = schema.components.schemas[name];
  if (!resolved) throw new Error(`SCHEMA_REFERENCE_NOT_FOUND: ${value.$ref}`);
  return resolved;
}

export function assertSchemaValidPublicRequest(domain, request) {
  const transportDomain = String(domain || '').toUpperCase();
  const requestSchemaName = REQUEST_SCHEMA[transportDomain];
  if (!requestSchemaName) throw new Error(`UNSUPPORTED_TRANSPORT_DOMAIN: ${transportDomain}`);
  const requestSchema = schema.components.schemas[requestSchemaName];
  const allowedCapabilities = requestSchema.properties.capability.enum;
  if (!allowedCapabilities.includes(request.capability)) {
    throw new Error(`CAPABILITY_NOT_PUBLIC_IN_SCHEMA: ${transportDomain}/${request.capability}`);
  }
  if (!request.input || typeof request.input !== 'object' || Array.isArray(request.input)) {
    throw new Error('INVALID_CAPABILITY_INPUT');
  }
  const inputSchema = dereference(requestSchema.properties.input);
  const visibleFields = new Set(Object.keys(inputSchema.properties ?? {}));
  const invisible = Object.keys(request.input).filter((field) => !visibleFields.has(field));
  if (invisible.length) {
    throw new Error(`INPUT_FIELD_NOT_PUBLIC_IN_SCHEMA: ${transportDomain}/${request.capability}/${invisible.join(',')}`);
  }
  return request;
}

