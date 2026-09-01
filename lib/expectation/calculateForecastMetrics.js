export function calculateForecastMetrics(rows, candidateName) {
  let absErrorSum = 0;
  let signedErrorSum = 0;
  let actualSum = 0;
  let worst = null;

  for (const row of rows) {
    const expected = row.expected[candidateName];
    const signed = expected - row.actual;
    const absolute = Math.abs(signed);
    absErrorSum += absolute;
    signedErrorSum += signed;
    actualSum += row.actual;

    if (!worst || absolute > worst.absolute_error) {
      worst = {
        month: row.month,
        actual: row.actual,
        expected,
        absolute_error: absolute,
      };
    }
  }

  const n = rows.length;
  return {
    candidate: candidateName,
    months_evaluated: n,
    mae: n ? absErrorSum / n : null,
    wape: actualSum ? absErrorSum / actualSum : null,
    bias_pct: actualSum ? signedErrorSum / actualSum : null,
    mean_bias_units: n ? signedErrorSum / n : null,
    worst_month: worst,
  };
}

export function attachMonthlyErrors(rows) {
  return rows.map((row) => ({
    ...row,
    errors: Object.fromEntries(
      Object.entries(row.expected).map(([name, expected]) => [name, {
        signed: expected - row.actual,
        absolute: Math.abs(expected - row.actual),
      }]),
    ),
  }));
}
