import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChangeContributionInput } from '../lib/product-change-contribution/parseInput.js';

const now = new Date('2026-09-03T12:00:00.000Z');

test('seller change input accepts two distinct closed months', () => {
  assert.deepEqual(parseChangeContributionInput({
    period_a: '2026-06', period_b: '2026-07',
  }, now), { periodA: '2026-06', periodB: '2026-07', cutoffMonth: '2026-07' });
});

test('seller change input rejects reversed, equal, open and unsupported inputs', () => {
  assert.throws(() => parseChangeContributionInput({
    period_a: '2026-07', period_b: '2026-06',
  }, now), /period_a must be before period_b/);
  assert.throws(() => parseChangeContributionInput({
    period_a: '2026-07', period_b: '2026-07',
  }, now), /period_a must be before period_b/);
  assert.throws(() => parseChangeContributionInput({
    period_a: '2026-08', period_b: '2026-09',
  }, now), /closed calendar months/);
  assert.throws(() => parseChangeContributionInput({
    period_a: '2026-06', period_b: '2026-07', threshold: 1,
  }, now), /Unsupported input/);
});

test('seller motor reuses organizational and store contribution semantics', () => {
  const source = readFileSync(new URL(
    '../lib/motors/ventas-seller-change-contribution-v01.js', import.meta.url,
  ), 'utf8');
  assert.match(source, /buildVentasOrganizationalContext/);
  assert.match(source, /cutoffMonth: parsed\.periodB/);
  assert.match(source, /calculateStoreChangeContribution\(context, parsed\)/);
  assert.doesNotMatch(source, /persona_roles|persona_sucursal|sucursales_master|ventas_raw/);
});
