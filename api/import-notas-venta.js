import { findFileInFolder, downloadFile } from '../lib/drive.js';
import { parseSheet } from '../lib/xlsx.js';
import { replaceTableSnapshot } from '../lib/neon.js';

const FILE_NAME = 'Listado_Notas_de_Venta_20210819.xlsx';
const SHEET_NAME = 'Hoja1';
const TABLE_NAME = 'notas_venta_raw';

function authorized(req) {
  const secret = process.env.IMPORT_SECRET;
  if (!secret) throw new Error('Missing IMPORT_SECRET');
  return req.headers['x-import-secret'] === secret;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  try {
    if (!authorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const startedAt = Date.now();
    const file = await findFileInFolder(FILE_NAME);
    const buffer = await downloadFile(file.id);
    const { columns, rows } = parseSheet(buffer, SHEET_NAME);
    const result = await replaceTableSnapshot(TABLE_NAME, columns, rows);

    return res.status(200).json({
      ok: true,
      source: {
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
      },
      sheet: SHEET_NAME,
      ...result,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
