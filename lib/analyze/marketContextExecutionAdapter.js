import { adaptCompetitiveContextInput } from '../custom-gpt/competitiveContextInputAdapter.js';

export async function materializeMarketContextExecution(spec, options = {}) {
  if (spec?.domain !== 'MARKET' || spec?.capability !== 'COMPETITIVE_CONTEXT') return spec;
  return {
    ...spec,
    input: await adaptCompetitiveContextInput(spec.input, options),
  };
}
