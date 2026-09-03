import { parseRelationInput } from '../competitive-relation/relationInput.js';

function parseMinEvaluableTransitions(value) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error('min_evaluable_transitions must be a positive integer');
  }
  return parsed;
}

export function parseInverseShareMovementInput(input = {}) {
  return {
    ...parseRelationInput(input, 'competitive_inverse_share_movement_v01'),
    minEvaluableTransitions: parseMinEvaluableTransitions(input.min_evaluable_transitions),
  };
}
