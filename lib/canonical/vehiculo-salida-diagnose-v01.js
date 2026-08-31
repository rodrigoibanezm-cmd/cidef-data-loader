import { queryDb } from '../neon.js';

export async function diagnoseVehiculoSalidaV01() {
  const rows = await queryDb(`
    WITH vc AS (
      SELECT vin, numero_factura, factura_tipo, nota_de_venta
      FROM vehiculo_canonico
      WHERE numero_factura IS NOT NULL
    )
    SELECT
      (SELECT count(*) FROM vc) AS vc_con_factura,
      (SELECT count(DISTINCT vc.vin)
         FROM vc
         JOIN ventas_raw v ON upper(btrim(v.nro_vin_chasis)) = vc.vin) AS match_vin,
      (SELECT count(DISTINCT vc.vin)
         FROM vc
         JOIN ventas_raw v
           ON upper(btrim(v.nro_vin_chasis)) = vc.vin
          AND master_norm(v.nro_factura) = master_norm(vc.numero_factura)) AS match_vin_nro_factura,
      (SELECT count(DISTINCT vc.vin)
         FROM vc
         JOIN ventas_raw v
           ON upper(btrim(v.nro_vin_chasis)) = vc.vin
          AND master_norm(v.factura) = master_norm(vc.numero_factura)) AS match_vin_factura,
      (SELECT count(DISTINCT vc.vin)
         FROM vc
         JOIN ventas_raw v
           ON upper(btrim(v.nro_vin_chasis)) = vc.vin
          AND master_norm(v.nro_factura) = master_norm(vc.factura_tipo)) AS match_vin_nro_factura_vs_tipo,
      (SELECT count(DISTINCT vc.vin)
         FROM vc
         JOIN ventas_raw v
           ON upper(btrim(v.nro_vin_chasis)) = vc.vin
          AND master_norm(v.factura) = master_norm(vc.factura_tipo)) AS match_vin_factura_vs_tipo,
      (SELECT count(DISTINCT vc.vin)
         FROM vc
         JOIN notas_venta_raw n
           ON upper(btrim(n.chasis)) = vc.vin
          AND vc.nota_de_venta IS NOT NULL
          AND master_norm(n.nota_de_venta) = master_norm(vc.nota_de_venta)) AS match_vin_nv
  `);

  const samples = await queryDb(`
    SELECT
      vc.vin,
      vc.factura_tipo AS vc_factura_tipo,
      vc.numero_factura AS vc_numero_factura,
      v.factura AS ventas_factura,
      v.nro_factura AS ventas_nro_factura,
      v.nro_operacion,
      v.razon_social
    FROM vehiculo_canonico vc
    JOIN ventas_raw v ON upper(btrim(v.nro_vin_chasis)) = vc.vin
    WHERE vc.numero_factura IS NOT NULL
    ORDER BY vc.vin
    LIMIT 20
  `);

  return { phase: 'vehiculo_salida_v01_diagnose', read_only: true, counts: rows[0], samples };
}
