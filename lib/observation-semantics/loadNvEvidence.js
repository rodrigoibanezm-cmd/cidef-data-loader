import { customGptDb } from '../custom-gpt/db.js';

const NV_SQL = `
WITH alias_map AS (
  SELECT valor_normalizado,
         MIN(sucursal_id) AS sucursal_id,
         COUNT(DISTINCT sucursal_id)::int AS match_count
  FROM sucursal_aliases
  WHERE fuente = 'notas_venta_raw' AND validated = true
  GROUP BY valor_normalizado
)
SELECT n.desc_sucursal_vta,
       n.fecha_nota_de_venta,
       a.sucursal_id,
       COALESCE(a.match_count, 0)::int AS match_count,
       s.nombre_canonico
FROM notas_venta_raw n
LEFT JOIN alias_map a
  ON a.valor_normalizado = master_norm(n.desc_sucursal_vta)
LEFT JOIN sucursales_master s
  ON s.sucursal_id = a.sucursal_id;
`;

export async function loadNvEvidence(sql = customGptDb()) {
  return sql.query(NV_SQL);
}
