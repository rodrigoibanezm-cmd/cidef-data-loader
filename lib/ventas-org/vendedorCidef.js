const asDay = (value) => value == null ? null : String(value).slice(0, 10);

function intervalContains(interval, eventDate) {
  const day = asDay(eventDate);
  if (!day) return false;
  const from = asDay(interval.valid_from);
  const to = asDay(interval.valid_to);
  if (from && day < from) return false;
  if (to && day > to) return false;
  // Open intervals represent the current snapshot only when MASTER marks them vigente.
  return interval.vigente === true || from != null || to != null;
}

export function isVendedorCidef(personaId, eventDate, eligibilityByPerson) {
  if (personaId == null || !eventDate) return false;
  const intervals = eligibilityByPerson?.get(String(personaId)) ?? [];
  return intervals.some((interval) => intervalContains(interval, eventDate));
}

export function toVendedorCidefLookup(rows = []) {
  const lookup = new Map();
  for (const row of rows) {
    const key = String(row.persona_id);
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key).push({
      sucursal_id: row.sucursal_id,
      valid_from: row.valid_from ?? null,
      valid_to: row.valid_to ?? null,
      vigente: row.vigente === true,
    });
  }
  return lookup;
}
