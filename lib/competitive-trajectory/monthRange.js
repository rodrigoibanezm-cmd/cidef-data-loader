export function monthLabels(dateFrom, dateTo) {
  const start = new Date(`${dateFrom.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${dateTo.slice(0, 7)}-01T00:00:00Z`);
  const months = [];
  for (let cursor = start; cursor <= end; cursor = new Date(Date.UTC(
    cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1,
  ))) {
    months.push(cursor.toISOString().slice(0, 7));
  }
  return months;
}
