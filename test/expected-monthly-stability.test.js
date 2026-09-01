import test from 'node:test';
import assert from 'node:assert/strict';
import { rankExpectationWindows } from '../lib/expectation/rankExpectationWindows.js';

const CANDIDATES = ['last_year', 'moving_average_3', 'moving_average_6', 'adjusted_last_year'];

function row(month, actual, best = 'moving_average_3') {
  return {
    month,
    actual,
    expected: Object.fromEntries(CANDIDATES.map((name) => [
      name,
      actual + (name === best ? 0 : 20),
    ])),
  };
}

test('ranks fixed recent windows and calendar years with unchanged metrics', () => {
  const rows = [
    row('2022-12', 100),
    row('2023-01', 100),
    row('2023-12', 100),
    row('2024-01', 100, 'adjusted_last_year'),
    row('2024-12', 100, 'adjusted_last_year'),
    row('2025-01', 100, 'adjusted_last_year'),
    row('2025-12', 100, 'adjusted_last_year'),
    row('2026-01', 100, 'adjusted_last_year'),
    row('2026-08', 100, 'adjusted_last_year'),
  ];

  const result = rankExpectationWindows(rows, CANDIDATES);

  assert.deepEqual(result.rolling.map((item) => item.label), [
    '2023-2026',
    '2024-2026',
    '2025-2026',
  ]);
  assert.equal(result.rolling[0].months_evaluated, 8);
  assert.equal(result.rolling[1].winner, 'adjusted_last_year');
  assert.equal(result.rolling[2].winner, 'adjusted_last_year');
  assert.equal(result.years.find((item) => item.label === '2023').winner, 'moving_average_3');
  assert.equal(result.years.find((item) => item.label === '2026').last_month, '2026-08');
});
