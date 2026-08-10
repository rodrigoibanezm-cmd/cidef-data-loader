import { listFilesInFolder, downloadFile } from '../lib/drive.js';
import { parsePriceWorkbook } from '../lib/price-list.js';
import { replaceTableSnapshot } from '../lib/neon.js';

const TABLE_NAME = 'lista_precios_raw';

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
    if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const startedAt = Date.now();
    const files = (await listFilesInFolder('LISTA DE PRECIOS'))
      .filter((f) => f.name.toLowerCase().endsWith('.xlsb'))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!files.length) throw new Error('No XLSB price-list files found in Drive folder');

    const parsed = [];
    for (const file of files) {
      const buffer = await downloadFile(file.id);
      parsed.push({ file, data: parsePriceWorkbook(buffer, file.name) });
    }

    const columns = [...new Set(parsed.flatMap((x) => x.data.columns))];
    const rows = [];
    for (const item of parsed) {
      const index = new Map(item.data.columns.map((c, i) => [c, i]));
      for (const row of item.data.rows) {
        rows.push(columns.map((c) => index.has(c) ? row[index.get(c)] : null));
      }
    }

    const result = await replaceTableSnapshot(TABLE_NAME, columns, rows);
    return res.status(200).json({
      ok: true,
      filesLoaded: files.length,
      fileNames: files.map((f) => f.name),
      ...result,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
