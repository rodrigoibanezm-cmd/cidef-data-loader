import { createPrivateKey } from 'node:crypto';
import { google } from 'googleapis';

function normalizePrivateKey(value) {
  let key = value.trim();

  if ((key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, '\n');

  if (!key.includes('BEGIN PRIVATE KEY')) {
    const decoded = Buffer.from(key, 'base64').toString('utf8').trim();
    if (decoded.includes('BEGIN PRIVATE KEY')) key = decoded;
  }

  try {
    createPrivateKey(key);
  } catch {
    throw new Error(`Invalid GOOGLE_PRIVATE_KEY format (len=${key.length}, pem=${key.includes('BEGIN PRIVATE KEY')}, lines=${key.split('\n').length})`);
  }

  return key;
}

function getDrive() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !rawPrivateKey) {
    throw new Error('Missing Google service account environment variables');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail.trim(),
      private_key: normalizePrivateKey(rawPrivateKey),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
}

export async function findFileInFolder(fileName) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID');

  const drive = getDrive();
  const result = await drive.files.list({
    q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
    pageSize: 10,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
  });

  const files = result.data.files ?? [];
  if (files.length === 0) throw new Error(`Drive file not found: ${fileName}`);
  if (files.length > 1) throw new Error(`More than one Drive file found: ${fileName}`);

  return files[0];
}

export async function downloadFile(fileId) {
  const drive = getDrive();
  const result = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );

  return Buffer.from(result.data);
}
