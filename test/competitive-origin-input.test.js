import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompetitiveInput } from '../lib/competitive/competitiveInput.js';

test('competitive input accepts optional origin_group', () => {
  const scope = parseCompetitiveInput({
    target_model_ids: [481],
    date_from: '2026-01-01',
    date_to: '2026-07-31',
    origin_group: 'chinese',
  });
  assert.equal(scope.originGroup, 'CHINESE');
});

test('competitive input rejects unknown origin_group', () => {
  assert.throws(() => parseCompetitiveInput({
    target_model_ids: [481],
    date_from: '2026-01-01',
    date_to: '2026-07-31',
    origin_group: 'ASIAN',
  }));
});
