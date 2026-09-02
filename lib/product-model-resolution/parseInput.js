const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseProductModelResolutionInput(input = {}) {
  const startMonth = String(input.start_month || '');
  const endMonth = String(input.end_month || '');
  if (!MONTH_RE.test(startMonth) || !MONTH_RE.test(endMonth)) {
    throw new Error('start_month and end_month must use YYYY-MM');
  }
  if (startMonth > endMonth) throw new Error('start_month must be <= end_month');
  return { startMonth, endMonth };
}
