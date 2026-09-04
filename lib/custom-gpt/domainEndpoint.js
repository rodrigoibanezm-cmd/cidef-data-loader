import {
  listDomainCapabilities,
  runCustomGptCapability,
} from '../custom-gpt-router.js';

export const DOMAIN_ENDPOINT_VERSION = '1.0.0';

export async function handleDomainCapabilityRequest(domain, req, res, executor = runCustomGptCapability) {
  const normalizedDomain = String(domain || '').trim().toUpperCase();
  const allowedCapabilities = listDomainCapabilities(normalizedDomain);

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      domain: normalizedDomain,
      domain_endpoint_version: DOMAIN_ENDPOINT_VERSION,
      error: 'POST required',
      allowedCapabilities,
    });
  }

  const body = req.body ?? {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      ok: false,
      domain: normalizedDomain,
      domain_endpoint_version: DOMAIN_ENDPOINT_VERSION,
      error: 'request body must be an object',
      error_code: 'INVALID_DOMAIN_REQUEST_BODY',
      allowedCapabilities,
    });
  }

  const unsupportedField = Object.keys(body).find((field) => !['capability', 'input'].includes(field));
  if (unsupportedField) {
    return res.status(400).json({
      ok: false,
      domain: normalizedDomain,
      domain_endpoint_version: DOMAIN_ENDPOINT_VERSION,
      error: `UNSUPPORTED_DOMAIN_REQUEST_FIELD: ${unsupportedField}`,
      error_code: 'UNSUPPORTED_DOMAIN_REQUEST_FIELD',
      allowedCapabilities,
    });
  }

  const capability = body.capability;
  if (typeof capability !== 'string' || !capability.trim()) {
    return res.status(400).json({
      ok: false,
      domain: normalizedDomain,
      domain_endpoint_version: DOMAIN_ENDPOINT_VERSION,
      error: 'capability is required',
      error_code: 'MISSING_CAPABILITY',
      allowedCapabilities,
    });
  }

  try {
    const result = await executor({
      domain: normalizedDomain,
      capability,
      input: body.input ?? {},
    });

    return res.status(200).json({
      ok: true,
      domain: normalizedDomain,
      capability: capability.trim().toUpperCase(),
      domain_endpoint_version: DOMAIN_ENDPOINT_VERSION,
      result,
    });
  } catch (error) {
    const message = error?.message || 'Domain capability request failed';
    const status = error?.code ? 400 : 500;
    return res.status(status).json({
      ok: false,
      domain: normalizedDomain,
      capability: capability.trim().toUpperCase(),
      domain_endpoint_version: DOMAIN_ENDPOINT_VERSION,
      error: message,
      ...(error?.code ? { error_code: error.code } : {}),
      allowedCapabilities,
    });
  }
}
