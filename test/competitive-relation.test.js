import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRelationInput } from '../lib/competitive-relation/relationInput.js';
import { projectRelations } from '../lib/competitive-relation/projectRelations.js';
import { evaluateCompetitiveRelation } from '../lib/competitive-relation/rule.js';

function summary({ key, target = 481, peer, gap, joint, crossings }) {
  return {
    pairKey: key,
    target: { entityKey: `MODEL:${target}`, modelId: target },
    peer: {
      entityKey: `MODEL:${peer}`,
      modelId: peer,
      identityStatus: 'RESUELTO',
      brand: 'PEER',
      model: String(peer),
    },
    universe: { universeKey: 'SUV|SUV|GASOLINA|CHINESE' },
    shareGap: { medianPp: gap },
    continuity: { jointActiveMonths: joint },
    crossings: { count: crossings },
  };
}

const passing = summary({ key: 'A', peer: 107, gap: 0.27, joint: 18, crossings: 11 });
const lateEntrant = summary({ key: 'B', peer: 565, gap: 0.99, joint: 3, crossings: 1 });
const noAlternation = summary({ key: 'C', peer: 533, gap: 1.2, joint: 15, crossings: 0 });
const farAway = summary({ key: 'D', peer: 454, gap: 7.24, joint: 16, crossings: 2 });

test('V0.1 rule keeps the three dimensions independent', () => {
  assert.equal(evaluateCompetitiveRelation(passing).selected, true);
  assert.equal(evaluateCompetitiveRelation(lateEntrant).selected, false);
  assert.equal(evaluateCompetitiveRelation(noAlternation).selected, false);
  assert.equal(evaluateCompetitiveRelation(farAway).selected, false);
});

test('rule boundaries are inclusive', () => {
  const boundary = summary({ key: 'E', peer: 999, gap: 3, joint: 6, crossings: 1 });
  assert.equal(evaluateCompetitiveRelation(boundary).selected, true);
});

test('relation output transports only selected rows and paginates after selection', () => {
  const context = { summaries: [noAlternation, passing, farAway, { ...passing, pairKey: 'Z', peer: { ...passing.peer, modelId: 108, entityKey: 'MODEL:108' } }] };
  const page = projectRelations(context, { pairOffset: 1, pairLimit: 1 });
  assert.equal(page.selectedTotal, 2);
  assert.equal(page.relations.length, 1);
  assert.equal(page.relations[0].pairKey, 'Z');
  assert.equal(page.page.totalRelations, 2);
});

test('productive relation requires a known origin group', () => {
  const base = { target_model_ids: [481], date_from: '2025-01-01', date_to: '2026-07-31' };
  assert.throws(() => parseRelationInput(base), /origin_group must be CHINESE or NON_CHINESE/);
  assert.throws(() => parseRelationInput({ ...base, origin_group: 'UNKNOWN' }), /origin_group must be CHINESE or NON_CHINESE/);
  const parsed = parseRelationInput({ ...base, origin_group: 'CHINESE' });
  assert.equal(parsed.scope.originGroup, 'CHINESE');
});
