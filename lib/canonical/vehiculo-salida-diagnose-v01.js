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

  const forumCounts = await queryDb(`
    WITH current_sale AS (
      SELECT DISTINCT
        vc.vin,
        vc.nota_de_venta,
        v.nro_operacion,
        v.razon_social,
        v.entidad_financiera
      FROM vehiculo_canonico vc
      JOIN ventas_raw v
        ON upper(btrim(v.nro_vin_chasis)) = vc.vin
       AND vc.numero_factura IS NOT NULL
       AND master_norm(v.nro_factura) = master_norm(vc.numero_factura)
    ), forum_sale AS (
      SELECT *
      FROM current_sale
      WHERE translate(master_norm(razon_social), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = 'FORUM DISTRIBUIDORA S.A.'
    ), notes_op AS (
      SELECT DISTINCT fs.vin, n.comentario
      FROM forum_sale fs
      JOIN notas_venta_raw n
        ON upper(btrim(n.chasis)) = fs.vin
       AND fs.nro_operacion IS NOT NULL
       AND master_norm(n.nro_operacion) = master_norm(fs.nro_operacion)
      WHERE n.comentario IS NOT NULL AND btrim(n.comentario) <> ''
    ), notes_nv AS (
      SELECT DISTINCT fs.vin, n.comentario
      FROM forum_sale fs
      JOIN notas_venta_raw n
        ON upper(btrim(n.chasis)) = fs.vin
       AND fs.nota_de_venta IS NOT NULL
       AND master_norm(n.nota_de_venta) = master_norm(fs.nota_de_venta)
      WHERE n.comentario IS NOT NULL AND btrim(n.comentario) <> ''
    ), notes_any AS (
      SELECT * FROM notes_op
      UNION
      SELECT * FROM notes_nv
    ), rut_match AS (
      SELECT DISTINCT na.vin, d.dealer_id
      FROM notes_any na
      JOIN dealers_master d
        ON regexp_replace(upper(na.comentario), '[^0-9A-ZÁÉÍÓÚÜÑ]', '', 'g') LIKE '%' || d.rut_normalizado || '%'
    ), legal_match AS (
      SELECT DISTINCT na.vin, d.dealer_id
      FROM notes_any na
      JOIN dealers_master d
        ON regexp_replace(master_norm(na.comentario), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') LIKE '%' || regexp_replace(master_norm(d.razon_social_canonica), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') || '%'
    ), commercial_match AS (
      SELECT DISTINCT na.vin, d.dealer_id
      FROM notes_any na
      JOIN dealers_master d
        ON d.nombre_comercial IS NOT NULL
       AND length(master_norm(d.nombre_comercial)) >= 4
       AND regexp_replace(master_norm(na.comentario), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') LIKE '%' || regexp_replace(master_norm(d.nombre_comercial), '[^A-Z0-9ÁÉÍÓÚÜÑ ]', '', 'g') || '%'
    )
    SELECT
      (SELECT count(DISTINCT vin) FROM forum_sale) AS forum_buyer,
      (SELECT count(DISTINCT vin) FROM notes_op) AS forum_comment_match_operacion,
      (SELECT count(DISTINCT vin) FROM notes_nv) AS forum_comment_match_nv,
      (SELECT count(DISTINCT vin) FROM notes_any) AS forum_comment_any,
      (SELECT count(DISTINCT vin) FROM rut_match) AS forum_rut_match,
      (SELECT count(DISTINCT vin) FROM legal_match) AS forum_legal_match,
      (SELECT count(DISTINCT vin) FROM commercial_match) AS forum_commercial_match,
      (SELECT count(DISTINCT vin) FROM (
        SELECT vin FROM rut_match
        UNION SELECT vin FROM legal_match
        UNION SELECT vin FROM commercial_match
      ) x) AS forum_any_dealer_match
  `);

  const forumUnmatched = await queryDb(`
    WITH exact_current AS (
      SELECT DISTINCT vc.vin
      FROM vehiculo_canonico vc
      JOIN ventas_raw v
        ON upper(btrim(v.nro_vin_chasis)) = vc.vin
       AND vc.numero_factura IS NOT NULL
       AND master_norm(v.nro_factura) = master_norm(vc.numero_factura)
      WHERE translate(master_norm(v.razon_social), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = 'FORUM DISTRIBUIDORA S.A.'
    ), any_forum AS (
      SELECT DISTINCT
        vc.vin,
        vc.numero_factura AS vc_numero_factura,
        vc.nota_de_venta AS vc_nota_de_venta,
        v.nro_factura AS ventas_nro_factura,
        v.factura AS ventas_factura,
        v.nro_operacion,
        v.razon_social,
        v.entidad_financiera
      FROM vehiculo_canonico vc
      JOIN ventas_raw v ON upper(btrim(v.nro_vin_chasis)) = vc.vin
      WHERE vc.numero_factura IS NOT NULL
        AND translate(master_norm(v.razon_social), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = 'FORUM DISTRIBUIDORA S.A.'
    )
    SELECT af.*
    FROM any_forum af
    WHERE NOT EXISTS (SELECT 1 FROM exact_current ec WHERE ec.vin = af.vin)
    ORDER BY af.vin, af.ventas_nro_factura
    LIMIT 20
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

  return {
    phase: 'vehiculo_salida_v01_diagnose',
    read_only: true,
    counts: rows[0],
    forum: forumCounts[0],
    forum_unmatched_current_invoice: forumUnmatched,
    samples,
  };
}
