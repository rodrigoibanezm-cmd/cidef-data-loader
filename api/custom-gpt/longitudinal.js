import { handleDomainCapabilityRequest } from '../../lib/custom-gpt/domainEndpoint.js';

export default async function handler(req, res) {
  return handleDomainCapabilityRequest('LONGITUDINAL', req, res);
}
