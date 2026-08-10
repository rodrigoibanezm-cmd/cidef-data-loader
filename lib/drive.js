import { google } from 'googleapis';

function getCredentials() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64');

  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON_BASE64');
  }
}

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
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
