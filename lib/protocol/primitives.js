import { createHash } from 'node:crypto';

export class ProtocolValidationError extends Error {
  constructor(code, path, detail = '') {
    super(`${code}${path ? ` at ${path}` : ''}${detail ? `: ${detail}` : ''}`);
    this.name = 'ProtocolValidationError';
    this.code = code;
    this.path = path;
  }
}

export function invariant(condition, code, path, detail) {
  if (!condition) throw new ProtocolValidationError(code, path, detail);
}

export function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function requireObject(value, path) {
  invariant(plainObject(value), 'INVALID_OBJECT', path);
  return value;
}

export function requireString(value, path) {
  invariant(typeof value === 'string' && value.trim().length > 0, 'INVALID_STRING', path);
  return value;
}

export function requireArray(value, path, { nonEmpty = false } = {}) {
  invariant(Array.isArray(value), 'INVALID_ARRAY', path);
  invariant(!nonEmpty || value.length > 0, 'EMPTY_ARRAY', path);
  return value;
}

export function requireEnum(value, allowed, path) {
  invariant(allowed.includes(value), 'INVALID_ENUM', path, String(value));
  return value;
}

export function rejectUnknown(value, allowed, path) {
  requireObject(value, path);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  invariant(unknown.length === 0, 'UNKNOWN_FIELD', path, unknown.join(','));
}

export function rejectKeysDeep(value, forbidden, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectKeysDeep(item, forbidden, `${path}[${index}]`));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    invariant(!forbidden.has(key.toLowerCase()), 'FORBIDDEN_FIELD', `${path}.${key}`);
    rejectKeysDeep(child, forbidden, `${path}.${key}`);
  }
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function clone(value) {
  return structuredClone(value);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (plainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  invariant(value !== undefined, 'NON_CANONICAL_VALUE', '$', 'undefined');
  invariant(typeof value !== 'number' || Number.isFinite(value), 'NON_CANONICAL_VALUE', '$', String(value));
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalSerialize(value) {
  return JSON.stringify(canonicalValue(value));
}

export function fingerprint(value, { excludeTopLevel = [] } = {}) {
  requireObject(value, '$');
  const excluded = new Set(excludeTopLevel);
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => !excluded.has(key)));
  return `sha256:${createHash('sha256').update(canonicalSerialize(payload)).digest('hex')}`;
}

export function sameCanonical(left, right) {
  return canonicalSerialize(left) === canonicalSerialize(right);
}

export function finalizeWithHash(draft, hashField, excludeTopLevel = []) {
  const output = clone(draft);
  delete output[hashField];
  output[hashField] = fingerprint(output, { excludeTopLevel: [...excludeTopLevel, hashField] });
  return deepFreeze(output);
}

export function verifyHash(value, hashField, excludeTopLevel = []) {
  requireString(value[hashField], `$.${hashField}`);
  invariant(
    value[hashField] === fingerprint(value, { excludeTopLevel: [...excludeTopLevel, hashField] }),
    'FINGERPRINT_MISMATCH', `$.${hashField}`,
  );
}
