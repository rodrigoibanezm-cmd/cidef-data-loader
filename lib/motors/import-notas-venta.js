import { neon } from '@neondatabase/serverless';
import { findFileInFolder, downloadFile } from '../drive.js';
import { parseSheet } from '../xlsx.js';
import { beginTableSnapshot, appendTableRows, abortTableSnapshot } from '../neon.js';

const FILE_NAME = 'Listado_Notas_de_Venta_20210819.xlsx';
const SHEET_NAME = 'Hoja1';
const TABLE_NAME = 'notas_venta_raw';
const TARGET = 'inventario_vehiculos_global_raw';
const DEALERS = 'forum_dealers_master';
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;

export async function run() {
  const startedAt = Date.now();
  const file = await findFileInFolder(FILE_NAME);
  const buffer = await downloadFile(file.id);
  const { columns, rows } = parseSheet(buffer, SHEET_NAME);
  const snapshot = await beginTableSnapshot(TABLE_NAME, columns);

  try {
    const loaded = await appendTableRows(snapshot, rows);
    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

    await sql.query(`ALTER TABLE ${q(TARGET)}
      ADD COLUMN IF NOT EXISTS es_dealer boolean,
      ADD COLUMN IF NOT EXISTS dealer_venta text,
      ADD COLUMN IF NOT EXISTS dealer_rut text,
      ADD COLUMN IF NOT EXISTS dealer_nombre text`);

    await sql.query(`UPDATE ${q(TARGET)} SET es_dealer=false, dealer_venta=NULL`);

    const direct = await sql.query(`UPDATE ${q(TARGET)} i
      SET es_dealer=true, dealer_venta=d.dealer_nombre
      FROM ${q(DEALERS)} d
      WHERE regexp_replace(upper(coalesce(i.rut,'')), '[^0-9K]', '', 'g')
          = regexp_replace(upper(d.dealer_rut), '[^0-9K]', '', 'g')
      RETURNING 1`);

    const forum = await sql.query(`WITH latest AS (
      SELECT DISTINCT ON (trim(chasis))
        trim(chasis) vin, coalesce(comentario,'') comentario
      FROM ${q(snapshot.staging)}
      WHERE upper(trim(razon_social))='FÓRUM DISTRIBUIDORA S.A.'
        AND nullif(trim(chasis),'') IS NOT NULL
      ORDER BY trim(chasis),
        CASE WHEN trim(fecha_nota_de_venta) ~ '^\\d{1,2}/\\d{1,2}/\\d{2} \\d{1,2}:\\d{2}$'
          THEN to_timestamp(trim(fecha_nota_de_venta),'MM/DD/YY HH24:MI') END DESC NULLS LAST,
        ctid DESC
    ), resolved AS (
      SELECT l.vin, d.dealer_rut, d.dealer_nombre
      FROM latest l
      JOIN ${q(DEALERS)} d
        ON regexp_replace(upper(l.comentario), '[^0-9K]', '', 'g') LIKE
           '%' || regexp_replace(upper(d.dealer_rut), '[^0-9K]', '', 'g') || '%'
    )
    UPDATE ${q(TARGET)} i
    SET es_dealer=true,
        dealer_venta=r.dealer_nombre,
        dealer_rut=r.dealer_rut,
        dealer_nombre=r.dealer_nombre
    FROM resolved r
    WHERE trim(i.vin_chasis)=r.vin
    RETURNING 1`);

    const totals = await sql.query(`SELECT
      count(*) FILTER (WHERE es_dealer IS TRUE)::int AS dealer_vins,
      count(*) FILTER (WHERE es_dealer IS FALSE)::int AS non_dealer_vins
      FROM ${q(TARGET)}`);

    await abortTableSnapshot(snapshot);
    return {
      source: { id: file.id, name: file.name, modifiedTime: file.modifiedTime },
      sheet: SHEET_NAME,
      table: TARGET,
      rowsLoaded: rows.length,
      columnsLoaded: columns.length,
      batchSize: loaded.batchSize,
      directDealerRows: direct.length,
      forumDealerRows: forum.length,
      ...totals[0],
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    await abortTableSnapshot(snapshot);
    throw error;
  }
}
