import crypto from 'node:crypto';

const AAD = Buffer.from('cidef-analysis-continuation.v1');
const enc = (value) => Buffer.from(value).toString('base64url');
const dec = (value) => Buffer.from(value, 'base64url');

function key(options = {}) {
  const basis = options.secret
    ?? process.env.RESOLUTION_TOKEN_SECRET
    ?? process.env.DATABASE_URL
    ?? process.env.POSTGRES_URL;
  if (!basis) {
    throw Object.assign(new Error('CONTINUATION_TOKEN_SECRET_REQUIRED'), {
      code: 'CONTINUATION_TOKEN_SECRET_REQUIRED',
    });
  }
  return crypto.createHash('sha256').update(`cidef-analysis-continuation-v1:${basis}`).digest();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((name) => [name, stableValue(value[name])]),
  );
}

export function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('base64url');
}

export function issueContinuationToken(state, options = {}) {
  const now = options.nowMs ?? Date.now();
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    iat: now,
    exp: now + (options.ttlMs ?? 30 * 60 * 1000),
    state,
  }));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(options), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return `v1.${enc(iv)}.${enc(ciphertext)}.${enc(cipher.getAuthTag())}`;
}

export function verifyContinuationToken(token, options = {}) {
  const [version, ivRaw, cipherRaw, tagRaw, ...extra] = String(token ?? '').split('.');
  if (version !== 'v1' || !ivRaw || !cipherRaw || !tagRaw || extra.length) {
    throw Object.assign(new Error('INVALID_CONTINUATION_ID'), { code: 'INVALID_CONTINUATION_ID' });
  }
  let payload;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(options), dec(ivRaw));
    decipher.setAAD(AAD);
    decipher.setAuthTag(dec(tagRaw));
    payload = JSON.parse(Buffer.concat([
      decipher.update(dec(cipherRaw)),
      decipher.final(),
    ]).toString('utf8'));
  } catch {
    throw Object.assign(new Error('INVALID_CONTINUATION_ID_SIGNATURE'), {
      code: 'INVALID_CONTINUATION_ID_SIGNATURE',
    });
  }
  const now = options.nowMs ?? Date.now();
  if (payload.v !== 1 || !payload.exp || payload.exp < now) {
    throw Object.assign(new Error('CONTINUATION_ID_EXPIRED'), { code: 'CONTINUATION_ID_EXPIRED' });
  }
  return payload.state;
}
