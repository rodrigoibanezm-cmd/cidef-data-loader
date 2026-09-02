const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertMonth(value, name) {
  const month = String(value || '');
  if (!MONTH_RE.test(month)) throw new Error(`${name} must use YYYY-MM`);
  return month;
}

export function parseObservationAuditInput(input = {}) {
  const startMonth = assertMonth(input.start_month, 'start_month');
  const endMonth = assertMonth(input.end_month, 'end_month');
  if (endMonth < startMonth) throw new Error('end_month must be >= start_month');

  const detailLimit = Number(input.detail_limit ?? 100);
  if (!Number.isInteger(detailLimit) || detailLimit < 1 || detailLimit > 200) {
    throw new Error('detail_limit must be an integer between 1 and 200');
  }

  let detailUnitId = null;
  if (input.detail_unit_id != null) {
    const parsed = Number(input.detail_unit_id);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error('detail_unit_id must be a positive integer');
    detailUnitId = String(parsed);
  }

  return { startMonth, endMonth, detailLimit, detailUnitId };
}
