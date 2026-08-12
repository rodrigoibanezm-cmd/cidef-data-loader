import { google } from 'googleapis';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';

function getCredentials() {
  const raw = process.env.GOOGLE_PRIVATE_KEY;
  if (!raw) throw new Error('Missing GOOGLE_PRIVATE_KEY');

  try {
    const decoded = Buffer.from(raw.trim(), 'base64').toString('utf8');
    const credentials = JSON.parse(decoded);
    if (!credentials.client_email || !credentials.private_key) throw new Error('missing fields');
    return credentials;
  } catch {
    throw new Error('GOOGLE_PRIVATE_KEY must contain the full service-account JSON encoded as Base64');
  }
}

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

function folderId() {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID');
  return id;
}

export async function findFileInFolder(fileName) {
  const drive = getDrive();
  const result = await drive.files.list({
    q: `'${folderId()}' in parents and name = '${fileName}' and trashed = false`,
    pageSize: 10,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
  });

  const files = result.data.files ?? [];
  if (files.length === 0) throw new Error(`Drive file not found: ${fileName}`);
  if (files.length > 1) throw new Error(`More than one Drive file found: ${fileName}`);
  return files[0];
}

export async function listFilesInFolder(nameContains) {
  const drive = getDrive();
  const files = [];
  let pageToken;
  do {
    const result = await drive.files.list({
      q: `'${folderId()}' in parents and name contains '${nameContains}' and trashed = false`,
      pageSize: 100,
      pageToken,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size)',
    });
    files.push(...(result.data.files ?? []));
    pageToken = result.data.nextPageToken;
  } while (pageToken);
  return files;
}

export async function downloadFile(fileId) {
  const drive = getDrive();
  const result = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(result.data);
}

export async function downloadFileToPath(fileId, filePath) {
  const drive = getDrive();
  const result = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );
  await pipeline(result.data, fs.createWriteStream(filePath));
  return filePath;
}
