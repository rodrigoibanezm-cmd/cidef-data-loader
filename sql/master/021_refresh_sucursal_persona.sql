BEGIN;

WITH s AS (
 SELECT trim(id_sucursal_vta) id_origen,
        min(regexp_replace(trim(desc_sucursal_vta),'\s+',' ','g')) nombre,
        count(DISTINCT master_norm(desc_sucursal_vta)) variantes
 FROM ventas_raw
 WHERE master_norm(id_sucursal_vta) IS NOT NULL AND master_norm(desc_sucursal_vta) IS NOT NULL
 GROUP BY trim(id_sucursal_vta)
)
INSERT INTO sucursales_master(id_sucursal_vta,nombre_canonico)
SELECT id_origen,nombre FROM s WHERE variantes=1
ON CONFLICT(id_sucursal_vta) DO NOTHING;

INSERT INTO sucursal_aliases(sucursal_id,fuente,valor_raw,valor_normalizado,match_method,validated)
SELECT s.sucursal_id,'ventas_raw',min(v.desc_sucursal_vta),master_norm(v.desc_sucursal_vta),'source_id',true
FROM ventas_raw v JOIN sucursales_master s ON s.id_sucursal_vta=trim(v.id_sucursal_vta)
WHERE master_norm(v.desc_sucursal_vta) IS NOT NULL
GROUP BY s.sucursal_id,master_norm(v.desc_sucursal_vta)
ON CONFLICT(fuente,valor_normalizado) DO NOTHING;

WITH names AS (
 SELECT master_norm(desc_sucursal_vta) norm,min(desc_sucursal_vta) raw FROM notas_venta_raw
 WHERE master_norm(desc_sucursal_vta) IS NOT NULL GROUP BY 1
), matches AS (
 SELECT n.norm,n.raw,min(s.sucursal_id) sucursal_id,count(DISTINCT s.sucursal_id) candidates
 FROM names n JOIN sucursal_aliases a ON a.valor_normalizado=n.norm
 JOIN sucursales_master s ON s.sucursal_id=a.sucursal_id GROUP BY n.norm,n.raw
)
INSERT INTO sucursal_aliases(sucursal_id,fuente,valor_raw,valor_normalizado,match_method,validated)
SELECT sucursal_id,'notas_venta_raw',raw,norm,'normalized_name',true FROM matches WHERE candidates=1
ON CONFLICT(fuente,valor_normalizado) DO NOTHING;

WITH n AS (
 SELECT master_norm(desc_sucursal_vta) norm,min(desc_sucursal_vta) raw FROM notas_venta_raw
 WHERE master_norm(desc_sucursal_vta) IS NOT NULL GROUP BY 1
), known AS (SELECT DISTINCT valor_normalizado norm FROM sucursal_aliases WHERE sucursal_id IS NOT NULL)
INSERT INTO master_conflicts(dominio,natural_key,conflict_type,evidence)
SELECT 'sucursal',n.norm,'name_without_unique_source_id',jsonb_build_object('raw',n.raw)
FROM n LEFT JOIN known k USING(norm) WHERE k.norm IS NULL
ON CONFLICT(dominio,natural_key,conflict_type) DO UPDATE SET evidence=excluded.evidence,updated_at=now();

WITH logins AS (
 SELECT master_norm(nombre_usuario) login FROM ventas_raw UNION SELECT master_norm(vendedor) FROM notas_venta_raw
)
INSERT INTO personas_master(usuario_canonico)
SELECT login FROM logins WHERE login IS NOT NULL ON CONFLICT(usuario_canonico) DO NOTHING;

WITH evidence AS (
 SELECT master_norm(n.vendedor) login,trim(v.vendedor) nombre,count(*) obs
 FROM notas_venta_raw n JOIN vehiculos_raw v
 ON master_norm(n.chasis)=master_norm(v.vin_chasis) AND master_norm(n.nota_de_venta)=master_norm(v.nota_de_venta)
 WHERE master_norm(n.vendedor) IS NOT NULL AND master_norm(v.vendedor) IS NOT NULL
 GROUP BY 1,2
), unique_map AS (
 SELECT login,min(nombre) nombre,sum(obs)::int obs FROM evidence GROUP BY login HAVING count(*)=1
)
UPDATE personas_master p SET nombre_canonico=u.nombre,evidence_count=u.obs,
 confidence=CASE WHEN u.obs>=5 THEN 1.000 ELSE 0.800 END,validated=(u.obs>=5),updated_at=now()
FROM unique_map u WHERE p.usuario_canonico=u.login;

INSERT INTO persona_aliases(persona_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,confidence,validated)
SELECT p.persona_id,'master_mapping',p.nombre_canonico,master_norm(p.nombre_canonico),'nombre','vin_and_nv',p.confidence,p.validated
FROM personas_master p WHERE p.nombre_canonico IS NOT NULL
ON CONFLICT(fuente,tipo_alias,valor_normalizado) DO NOTHING;

INSERT INTO master_conflicts(dominio,natural_key,conflict_type,evidence)
SELECT 'persona',usuario_canonico,'login_without_verified_full_name',jsonb_build_object('login',usuario_canonico)
FROM personas_master WHERE nombre_canonico IS NULL
ON CONFLICT(dominio,natural_key,conflict_type) DO UPDATE SET evidence=excluded.evidence,updated_at=now();

COMMIT;
