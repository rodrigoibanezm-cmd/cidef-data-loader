import { queryDb } from '../neon.js';

const SOURCE = 'master_saneamiento_final_2026_08_31';

async function summary() {
  const rows = await queryDb(`
    SELECT
      (SELECT count(*) FROM personas_master) AS personas_master,
      (SELECT count(*) FROM persona_roles WHERE vigente AND rol='VENDEDOR_TIENDA') AS vendedores_tienda_vigentes,
      (SELECT count(*) FROM persona_roles WHERE vigente AND rol='SUPERVISOR_TIENDA') AS supervisores_tienda_vigentes,
      (SELECT count(*) FROM persona_roles WHERE vigente AND rol='SUPERVISOR_DEALER') AS supervisores_dealer_vigentes,
      (SELECT count(*) FROM persona_estado_comercial WHERE vigente_fuerza_venta) AS fuerza_venta_vigente,
      (SELECT count(*) FROM persona_sucursal WHERE vigente) AS persona_sucursal_vigentes,
      (SELECT count(*) FROM personas_master
        WHERE rut_normalizado IS NOT NULL
          AND rut_dv IS NOT NULL
          AND NOT master_rut_valid(rut_normalizado || rut_dv)) AS rut_invalidos_completos,
      (SELECT count(*)
         FROM persona_aliases a
         JOIN personas_master p ON p.persona_id=a.persona_id
        WHERE p.usuario_canonico='JVARGAS'
          AND a.valor_normalizado='JENIFFER'
          AND a.validated) AS jenniffer_corto_validado,
      (SELECT count(*)
         FROM persona_aliases a
         JOIN personas_master p ON p.persona_id=a.persona_id
        WHERE p.usuario_canonico='JVARGAS'
          AND a.valor_normalizado='JENIFFER VARGAS'
          AND a.validated) AS jenniffer_vargas_validado,
      (SELECT count(*)
         FROM persona_roles r
         JOIN personas_master p ON p.persona_id=r.persona_id
        WHERE p.usuario_canonico='JVARGAS'
          AND r.rol='VENDEDOR_TIENDA'
          AND r.vigente) AS jvargas_vendedor_vigente,
      (SELECT count(*)
         FROM persona_sucursal ps
         JOIN personas_master p ON p.persona_id=ps.persona_id
        WHERE p.usuario_canonico='JVARGAS'
          AND ps.rol='VENDEDOR_TIENDA'
          AND ps.vigente) AS jvargas_sucursal_vigente,
      (SELECT coalesce(bool_or(ec.vigente_fuerza_venta),false)
         FROM persona_estado_comercial ec
         JOIN personas_master p ON p.persona_id=ec.persona_id
        WHERE p.usuario_canonico='JVARGAS') AS jvargas_fuerza_vigente,
      (SELECT count(*) FROM master_conflicts
        WHERE dominio='persona'
          AND natural_key='JENIFFER|ANTOFAGASTA'
          AND conflict_type='roster_identity_unresolved'
          AND status='rejected') AS conflicto_jenniffer_rejected,
      (SELECT count(*) FROM master_conflicts
        WHERE dominio='persona'
          AND conflict_type='persona_rut_invalid_source'
          AND status='rejected') AS conflictos_rut_rejected
  `);
  return rows[0];
}

export async function sanitizePersonaFinal() {
  // JENIFFER de la nómina no tiene evidencia suficiente para equivaler a JVARGAS.
  // Se conserva JVARGAS/JENIFFER VARGAS como identidad histórica demostrada,
  // pero se retiran las relaciones vigentes nacidas de la inferencia débil.
  await queryDb(`
    UPDATE persona_aliases a
       SET validated=false,
           match_method='roster_identity_unresolved',
           updated_at=now()
      FROM personas_master p
     WHERE a.persona_id=p.persona_id
       AND p.usuario_canonico='JVARGAS'
       AND a.valor_normalizado='JENIFFER'
  `);

  await queryDb(`
    UPDATE persona_aliases a
       SET validated=true,
           match_method='vin_nv_exact_cross_source',
           confidence=1.000,
           updated_at=now()
      FROM personas_master p
     WHERE a.persona_id=p.persona_id
       AND p.usuario_canonico='JVARGAS'
       AND a.valor_normalizado='JENIFFER VARGAS'
  `);

  await queryDb(`
    DELETE FROM persona_sucursal ps
    USING personas_master p
    WHERE ps.persona_id=p.persona_id
      AND p.usuario_canonico='JVARGAS'
      AND ps.rol='VENDEDOR_TIENDA'
      AND ps.vigente
  `);

  await queryDb(`
    DELETE FROM persona_roles r
    USING personas_master p
    WHERE r.persona_id=p.persona_id
      AND p.usuario_canonico='JVARGAS'
      AND r.rol='VENDEDOR_TIENDA'
      AND r.vigente
  `);

  await queryDb(`
    UPDATE persona_estado_comercial ec
       SET vigente_fuerza_venta=false,
           fuente=$1,
           updated_at=now()
      FROM personas_master p
     WHERE ec.persona_id=p.persona_id
       AND p.usuario_canonico='JVARGAS'
  `, [SOURCE]);

  await queryDb(`
    INSERT INTO master_conflicts(dominio,natural_key,conflict_type,evidence,status)
    VALUES (
      'persona',
      'JENIFFER|ANTOFAGASTA',
      'roster_identity_unresolved',
      jsonb_build_object(
        'source','Listado vendedores canal directo CIDEF-Junio 2026',
        'reason','JENIFFER sin RUT/correo no demuestra equivalencia con JVARGAS; JENIFFER VARGAS sí queda como identidad histórica por evidencia VIN/NV',
        'decision','no promover fila JENIFFER de nómina a identidad/rol vigente'
      ),
      'rejected'
    )
    ON CONFLICT(dominio,natural_key,conflict_type)
    DO UPDATE SET evidence=excluded.evidence,status='rejected',updated_at=now()
  `);

  // Los RUT fuente inválidos se rechazan; no se inventa un DV corregido.
  await queryDb(`
    INSERT INTO master_conflicts(dominio,natural_key,conflict_type,evidence,status)
    SELECT
      'persona',
      p.usuario_canonico,
      'persona_rut_invalid_source',
      jsonb_build_object(
        'usuario_canonico',p.usuario_canonico,
        'nombre_canonico',p.nombre_canonico,
        'rut_observado',coalesce(p.rut_normalizado,'') || coalesce(p.rut_dv,''),
        'reason','RUT/DV fuente inválido según master_rut_valid(); identificador rechazado sin inferir corrección'
      ),
      'rejected'
    FROM personas_master p
    WHERE p.usuario_canonico IN ('KCABALLOS','VLEYTON')
    ON CONFLICT(dominio,natural_key,conflict_type)
    DO UPDATE SET evidence=excluded.evidence,status='rejected',updated_at=now()
  `);

  await queryDb(`
    UPDATE personas_master
       SET rut_normalizado=NULL,
           rut_dv=NULL,
           updated_at=now()
     WHERE usuario_canonico IN ('KCABALLOS','VLEYTON')
  `);

  // Evita volver a persistir un RUT completo con DV inválido.
  await queryDb(`
    ALTER TABLE personas_master
      DROP CONSTRAINT IF EXISTS ck_personas_master_rut_valid
  `);
  await queryDb(`
    ALTER TABLE personas_master
      ADD CONSTRAINT ck_personas_master_rut_valid
      CHECK (
        rut_normalizado IS NULL
        OR rut_dv IS NULL
        OR master_rut_valid(rut_normalizado || rut_dv)
      )
  `);

  return { phase: 'persona_saneamiento_final', summary: await summary() };
}

export async function summarizePersonaFinal() {
  return summary();
}
