import { shiftMonth } from '../expectation/monthSeries.js';

export function monthRange(startMonth, endMonth) {
  const months = [];
  let current = startMonth;
  while (current && current <= endMonth) {
    months.push(current);
    current = shiftMonth(current, 1);
  }
  return months;
}
