import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProductGenerationInput } from '../lib/product-generation/input.js';

test('product generation input accepts bounded filters', () => {
  const scope = parseProductGenerationInput({
    modelo_id: 481,
    version_id: 7175,
    generation_id: 9,
    membership_status: 'RESOLVED',
    include_evidence: true,
    limit: 25,
  });
  assert.deepEqual(scope, {
    modeloId: 481,
    versionId: 7175,
    generationId: 9,
    membershipStatus: 'RESOLVED',
    includeEvidence: true,
    limit: 25,
  });
});

test('product generation input keeps discovery defaults bounded', () => {
  const scope = parseProductGenerationInput({});
  assert.equal(scope.limit, 100);
  assert.equal(scope.includeEvidence, false);
  assert.equal(scope.modeloId, null);
});

test('product generation input rejects invalid ids, status and limit', () => {
  assert.throws(() => parseProductGenerationInput({ modelo_id: 0 }));
  assert.throws(() => parseProductGenerationInput({ membership_status: 'UNKNOWN' }));
  assert.throws(() => parseProductGenerationInput({ limit: 201 }));
});
