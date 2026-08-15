import { neon } from '@neondatabase/serverless';

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;

export async function mergeInventoryStaging(staging, target = 'inventario_vehiculos_global_raw') {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const columns = await sql.query(`SELECT c.column_name FROM information_schema.columns c
    JOIN information_schema.columns s ON s.column_name=c.column_name AND s.table_name=$1
    WHERE c.table_name=$2 AND c.column_name <> 'sucursal_venta'
    ORDER BY c.ordinal_position`, [staging, target]);
  const names = columns.map((r) => r.column_name);
  if (!names.includes('vin_chasis')) throw new Error('vin_chasis missing from staging/target');
  const mutable = names.filter((n) => n !== 'vin_chasis');
  const st = q(staging);
  const tg = q(target);
  const updates = mutable.map((n) => `${q(n)}=s.${q(n)}`).join(', ');
  const updated = await sql.query(`UPDATE ${tg} t SET ${updates} FROM ${st} s
    WHERE NULLIF(TRIM(s.vin_chasis),'') IS NOT NULL AND TRIM(t.vin_chasis)=TRIM(s.vin_chasis) RETURNING 1`);
  const list = names.map(q).join(', ');
  const select = names.map((n) => `s.${q(n)}`).join(', ');
  const inserted = await sql.query(`INSERT INTO ${tg} (${list}) SELECT ${select} FROM ${st} s
    WHERE NULLIF(TRIM(s.vin_chasis),'') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM ${tg} t WHERE TRIM(t.vin_chasis)=TRIM(s.vin_chasis)) RETURNING 1`);
  return { updated: updated.length, inserted: inserted.length };
}
