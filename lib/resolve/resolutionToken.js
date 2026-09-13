import crypto from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

function key(options={}) {
  let basis = options.secret ?? process.env.RESOLUTION_TOKEN_SECRET ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!basis) throw Object.assign(new Error('RESOLUTION_TOKEN_SECRET_REQUIRED'), { code:'RESOLUTION_TOKEN_SECRET_REQUIRED' });
  if (!options.secret && !process.env.RESOLUTION_TOKEN_SECRET) basis = `cidef-resolution-v1:${basis}`;
  return crypto.createHash('sha256').update(basis).digest();
}
const enc = value => Buffer.from(value).toString('base64url');
const dec = value => Buffer.from(value,'base64url');
const AAD_V1 = Buffer.from('cidef-resolution.v1');
const AAD_V2 = Buffer.from('cidef-resolution.v2');

function encrypt(payload, aad, options={}) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(options), iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return { iv, ciphertext, tag:cipher.getAuthTag() };
}

function decrypt(iv, ciphertext, tag, aad, options={}) {
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(options),iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
}

export function issueResolutionToken(authority, options={}) {
  const now = options.nowMs ?? Date.now();
  const json = Buffer.from(JSON.stringify({ v:2, iat:now, exp:now+(options.ttlMs ?? 30*60*1000), authority }));
  const compressed = deflateRawSync(json, { level:9 });
  const { iv, ciphertext, tag } = encrypt(compressed, AAD_V2, options);
  return `v2.${enc(Buffer.concat([iv,ciphertext,tag]))}`;
}

function verifyV1(parts, options={}) {
  const [version,ivRaw,cipherRaw,tagRaw,...extra] = parts;
  if (version!=='v1' || !ivRaw || !cipherRaw || !tagRaw || extra.length) throw Object.assign(new Error('INVALID_RESOLUTION_ID'),{code:'INVALID_RESOLUTION_ID'});
  const plain=decrypt(dec(ivRaw),dec(cipherRaw),dec(tagRaw),AAD_V1,options);
  return JSON.parse(plain.toString('utf8'));
}

function verifyV2(parts, options={}) {
  const [version,packedRaw,...extra] = parts;
  if (version!=='v2' || !packedRaw || extra.length) throw Object.assign(new Error('INVALID_RESOLUTION_ID'),{code:'INVALID_RESOLUTION_ID'});
  const packed=dec(packedRaw);
  if (packed.length < 29) throw Object.assign(new Error('INVALID_RESOLUTION_ID'),{code:'INVALID_RESOLUTION_ID'});
  const iv=packed.subarray(0,12);
  const tag=packed.subarray(packed.length-16);
  const ciphertext=packed.subarray(12,packed.length-16);
  const compressed=decrypt(iv,ciphertext,tag,AAD_V2,options);
  return JSON.parse(inflateRawSync(compressed).toString('utf8'));
}

export function verifyResolutionToken(token, options={}) {
  const parts=String(token??'').split('.');
  let payload;
  try {
    payload=parts[0]==='v2' ? verifyV2(parts,options) : verifyV1(parts,options);
  } catch (error) {
    if (error?.code==='INVALID_RESOLUTION_ID') throw error;
    throw Object.assign(new Error('INVALID_RESOLUTION_ID_SIGNATURE'),{code:'INVALID_RESOLUTION_ID_SIGNATURE'});
  }
  const now=options.nowMs??Date.now();
  if(![1,2].includes(payload.v) || !payload.exp || payload.exp<now) throw Object.assign(new Error('RESOLUTION_ID_EXPIRED'),{code:'RESOLUTION_ID_EXPIRED'});
  return payload.authority;
}
