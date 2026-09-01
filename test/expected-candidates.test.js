import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedAdjustedLastYear,
  expectedLastYear,
  expectedMovingAverage,
} from '../lib/expectation/expectedCandidates.js';

function salesIndex(entries) {
  return new Map(entries);
}

test('last year uses exactly target month minus 12 months', () => {
  const index = salesIndex([
    ['2025-03', 110],
    ['2026-02', 999],
  ]);
  assert.equal(expectedLastYear(index, '2026-03'), 110);
});

test('moving averages use only months before the target', () => {
  const index = salesIndex([
    ['2026-01', 90],
    ['2026-02', 120],
    ['2026-03', 150],
    ['2026-04', 9999],
  ]);
  assert.equal(expectedMovingAverage(index, '2026-04', 3), 120);
});

test('adjusted last year scales seasonality by recent relative level', () => {
  const index = salesIndex([
    ['2024-12', 60],
    ['2025-01', 80],
    ['2025-02', 100],
    ['2025-03', 110],
    ['2025-12', 90],
    ['2026-01', 120],
    ['2026-02', 150],
  ]);

  assert.equal(expectedAdjustedLastYear(index, '2026-03'), 165);
});

test('candidate returns null when required historical evidence is missing', () => {
  const index = salesIndex([['2025-03', 100]]);
  assert.equal(expectedMovingAverage(index, '2026-03', 3), null);
  assert.equal(expectedAdjustedLastYear(index, '2026-03'), null);
});
