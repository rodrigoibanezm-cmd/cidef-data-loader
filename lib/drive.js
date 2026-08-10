import { google } from 'googleapis';

function getDrive() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error('Missing Google service account environment variables');
  }

  privateKey = privateKey.trim();
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail.trim(), private_key: privateKey },
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
