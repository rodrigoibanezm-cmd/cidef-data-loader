import { customGptDb } from '../custom-gpt/db.js';

const STORE_SQL = `
SELECT id_sucursal_vta::text AS source_key,
       MIN(sucursal_id) AS sucursal_id,
       MIN(nombre_canonico) AS nombre_canonico,
       COUNT(*)::int AS match_count
FROM sucursales_master
GROUP BY id_sucursal_vta;
`;

const SELLER_SQL = `
SELECT usuario_canonico::text AS source_key,
       MIN(persona_id) AS persona_id,
       MIN(nombre_canonico) AS nombre_canonico,
       BOOL_AND(validated) AS validated,
       COUNT(*)::int AS match_count
FROM personas_master
GROUP BY usuario_canonico;
`;

function toLookup(rows, idField) {
  return new Map(rows.map((row) => [
    String(row.source_key),
    {
      canonical_id: row[idField],
      nombre_canonico: row.nombre_canonico ?? null,
      validated: row.validated ?? null,
      match_count: Number(row.match_count ?? 0),
    },
  ]));
}

export async function loadOrganizationalIdentityMaps(sql = customGptDb()) {
  const [stores, sellers] = await Promise.all([
    sql.query(STORE_SQL),
    sql.query(SELLER_SQL),
  ]);

  return {
    stores: toLookup(stores, 'sucursal_id'),
    sellers: toLookup(sellers, 'persona_id'),
  };
}
