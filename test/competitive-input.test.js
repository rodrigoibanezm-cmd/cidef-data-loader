import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompetitiveInput } from '../lib/competitive/competitiveInput.js';

test('competitive input accepts targets, dates and optional geography', () => {
  const scope = parseCompetitiveInput({
    target_model_ids: [481, 23, 481], date_from: '2026-01-01', date_to: '2026-07-31',
    geography: { level: 'region', values: ['METROPOLITANA', 'VALPARAISO'] },
  });
  assert.deepEqual(scope.targetModelIds, [481, 23]);
  assert.equal(scope.geography.column, 'region');
});

test('competitive input rejects invalid dates and empty targets', () => {
  assert.throws(() => parseCompetitiveInput({ target_model_ids: [], date_from: '2026-01-01', date_to: '2026-07-31' }));
  assert.throws(() => parseCompetitiveInput({ target_model_ids: [1], date_from: '2026-02-30', date_to: '2026-07-31' }));
});
