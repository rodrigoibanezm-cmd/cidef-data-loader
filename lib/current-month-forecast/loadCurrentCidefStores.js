import { customGptDb } from '../custom-gpt/db.js';

const SQL = `
SELECT sucursal_id,
       MIN(nombre_canonico) AS sucursal
FROM sucursales_master
WHERE tipo_canal = 'CIDEF'
GROUP BY sucursal_id
ORDER BY sucursal_id;
`;

export async function loadCurrentCidefStores(sql = customGptDb()) {
  const rows = await sql.query(SQL);
  return rows.map((row) => ({
    sucursal_id: row.sucursal_id,
    sucursal: row.sucursal ?? null,
    tipo_canal: 'CIDEF',
  }));
}
