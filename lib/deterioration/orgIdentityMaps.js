import { customGptDb } from '../custom-gpt/db.js';

function buildUniqueMap(rows, keyName, idName, labelName, validatedName = null) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[keyName] == null ? null : String(row[keyName]).trim();
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const map = new Map();
  const ambiguous = [];
  for (const [key, matches] of grouped) {
    if (matches.length !== 1) {
      ambiguous.push(key);
      continue;
    }
    const row = matches[0];
    map.set(key, {
      id: row[idName],
      label: row[labelName] ?? key,
      validated: validatedName ? row[validatedName] === true : true,
    });
  }
  return { map, ambiguous };
}

export async function loadOrgIdentityMaps(sql = customGptDb()) {
  const [stores, sellers] = await Promise.all([
    sql.query(`SELECT sucursal_id, id_sucursal_vta, nombre_canonico FROM sucursales_master`),
    sql.query(`SELECT persona_id, usuario_canonico, nombre_canonico, validated FROM personas_master`),
  ]);
  return {
    tienda: buildUniqueMap(stores, 'id_sucursal_vta', 'sucursal_id', 'nombre_canonico'),
    vendedor: buildUniqueMap(sellers, 'usuario_canonico', 'persona_id', 'nombre_canonico', 'validated'),
  };
}

export function resolveOrgSale(sale, grain, identities) {
  const rawKey = grain === 'tienda' ? sale.sucursal_id : sale.vendedor;
  const key = rawKey == null ? null : String(rawKey).trim();
  const match = key ? identities[grain].map.get(key) : null;
  if (!match) return { resolved: false, rawKey: key };
  return {
    resolved: true,
    rawKey: key,
    unitId: match.id,
    unitLabel: match.label,
    identityValidated: match.validated,
  };
}
