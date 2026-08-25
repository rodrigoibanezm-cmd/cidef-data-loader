const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/;

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

export function parseSourceDate(value) {
  if (value == null || String(value).trim() === '') return { status: 'null', date: null };
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  let y; let m; let d;
  if (iso) [, y, m, d] = iso;
  else {
    const md = DATE_RE.exec(s);
    if (!md) return { status: 'invalid', date: null };
    m = md[1]; d = md[2]; y = 2000 + Number(md[3]);
  }
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const ok = date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
  return ok ? { status: 'parsed', date } : { status: 'invalid', date: null };
}

export function dateKey(date, grain) {
  const y = date.getUTCFullYear(); const m = date.getUTCMonth() + 1; const d = date.getUTCDate();
  if (grain === 'day') return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (grain === 'month') return `${y}-${String(m).padStart(2, '0')}`;
  if (grain === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (grain === 'year') return String(y);
  return null;
}

export function daysBetween(asOf, start) {
  return Math.floor((asOf.getTime() - start.getTime()) / 86400000);
}
