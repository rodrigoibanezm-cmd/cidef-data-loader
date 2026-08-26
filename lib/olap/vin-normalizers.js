export function normalizeText(value) {
  if (value == null) return null;
  const s = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.toUpperCase() : null;
}

export function normalizeVin(value) {
  if (value == null) return { raw: value, normalized: null };
  const raw = String(value);
  const normalized = raw.trim();
  return { raw, normalized: normalized || null };
}

export { parseSourceDate, dateKey, daysBetween } from './semantics/time.js';
