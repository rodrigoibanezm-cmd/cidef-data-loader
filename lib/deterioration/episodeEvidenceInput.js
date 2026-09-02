import { parseOrgDeteriorationInput } from './orgDeteriorationInput.js';

function positiveInt(value, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function parseEpisodeEvidenceInput(input = {}) {
  const parsed = parseOrgDeteriorationInput({
    ...input,
    output_mode: 'episodes',
  });
  if (parsed.baselines.length !== 1) throw new Error('episode evidence requires exactly one baseline');
  if (parsed.deviations.length !== 1) throw new Error('episode evidence requires exactly one deviation method');
  if (parsed.persistence.length !== 1) throw new Error('episode evidence requires exactly one persistence rule');

  const contextMonths = positiveInt(input.context_months, 3);
  if (!contextMonths || contextMonths > 12) {
    throw new Error('context_months must be an integer from 1 to 12');
  }
  const detailUnitId = input.detail_unit_id == null ? null : positiveInt(input.detail_unit_id, null);
  if (input.detail_unit_id != null && !detailUnitId) {
    throw new Error('detail_unit_id must be a positive integer');
  }
  return { ...parsed, contextMonths, detailUnitId };
}
