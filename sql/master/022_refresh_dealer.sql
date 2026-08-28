BEGIN;

CREATE TEMP TABLE dealer_seed(rut text, canonical text, commercial text) ON COMMIT DROP;
INSERT INTO dealer_seed VALUES
('79600500','AUTOMECANICA COLON LIMITADA','AUTOMECÁNICA COLON'),('78071163','AUTOMOTRIZ AUSTRAL SPA',NULL),
('79528950','AUTOMOTRIZ CARMONA Y COMPAÑIA LIMITADA',NULL),('76068841','AUTOMOTRIZ FOR CENTER S.A',NULL),
('96502140','AUTOMOTRIZ ROSSELOT S.A.',NULL),('76506740','COMERCIALIZADORA OGAZ Y OGAZ SPA','AUTOS OGAZ'),
('76406005','AUTOMOTRIZ PEDRO ANDRES OGAZ SANTELICES E I R L','AUTOS OGAZ PEDRO OGAZ'),
('77244120','COMERCIAL COLON LIMITADA',NULL),('92909000','CURIFOR','CURIFOR'),
('78189900','GELLONA AUTOS Y COMPANIA LIMITADA','GELLONA'),('96639090','IMPORT EXPORT STOP S.A.','IMPORT & EXPORT'),
('96668460','KLASSIK CAR S.A.',NULL),('96642160','PIAMONTE','PIAMONTE'),('76537562','RENTAL BASILIO SPA','RENTAL BASILIO'),
('76188205','VALDEPEZ SPA','CARPOINT'),('76998631','VARAS HERMANOS SERVICIOS INTEGRALES SPA','VARAS HERMANOS'),
('76810800','AUTOMOTORA VEGA ARTUS LIMITADA','VEGA ARTUS'),('76306357','AUTOMOTORA MELHUISH RETAIL SPA',NULL),
('88867500','COMERCIAL GRASS & ARUESTE LTDA.',NULL),('76296863','AUTOMOTRIZ PORTILLO SUR LIMITADA',NULL),
('79853470','AUTOMOTRIZ CORDILLERA S.A.',NULL),('85234600','ROMANINI','ROMANINI'),('76719932','CITY MOTOR SPA.','CITY MOTOR');

WITH direct AS (
 SELECT DISTINCT s.rut,s.canonical,s.commercial,
        master_rut((regexp_match(n.cliente,'([0-9]{1,2}\\.?[0-9]{3}\\.?[0-9]{3}-?[0-9Kk])'))[1]) full_rut
 FROM dealer_seed s
 JOIN notas_venta_raw n ON left(master_rut(n.cliente),8)=s.rut
 WHERE master_rut_valid((regexp_match(n.cliente,'([0-9]{1,2}\\.?[0-9]{3}\\.?[0-9]{3}-?[0-9Kk])'))[1])
), valid_direct AS (
 SELECT rut,canonical,commercial,min(right(full_rut,1)) dv
 FROM direct GROUP BY rut,canonical,commercial HAVING count(DISTINCT right(full_rut,1))=1
)
INSERT INTO dealers_master(rut_normalizado,rut_dv,razon_social_canonica,nombre_comercial,identity_status)
SELECT rut,dv,canonical,commercial,'rut_validated' FROM valid_direct
ON CONFLICT(rut_normalizado) DO UPDATE SET rut_dv=excluded.rut_dv,identity_status='rut_validated',updated_at=now();

INSERT INTO dealer_aliases(dealer_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,validated)
SELECT d.dealer_id,'notas_venta_raw',min(n.razon_social),master_norm(n.razon_social),'razon_social','validated_direct_rut',true
FROM notas_venta_raw n
JOIN dealers_master d ON d.identity_status='rut_validated' AND left(master_rut(n.cliente),8)=d.rut_normalizado
WHERE master_norm(n.razon_social) IS NOT NULL AND master_norm(n.razon_social) <> 'FÓRUM DISTRIBUIDORA S.A.'
  AND master_rut_valid((regexp_match(n.cliente,'([0-9]{1,2}\\.?[0-9]{3}\\.?[0-9]{3}-?[0-9Kk])'))[1])
GROUP BY d.dealer_id,master_norm(n.razon_social)
ON CONFLICT(fuente,tipo_alias,valor_normalizado) DO NOTHING;

WITH forum AS (
 SELECT comentario,
        master_rut((regexp_match(comentario,'([0-9]{1,2}\\.?[0-9]{3}\\.?[0-9]{3}-?[0-9Kk])'))[1]) full_rut
 FROM notas_venta_raw WHERE master_norm(razon_social)='FÓRUM DISTRIBUIDORA S.A.' AND comentario IS NOT NULL
), valid AS (
 SELECT comentario,full_rut,left(full_rut,-1) body,right(full_rut,1) dv FROM forum WHERE master_rut_valid(full_rut)
), known AS (
 SELECT v.body,min(v.dv) dv,min(s.canonical) canonical,min(s.commercial) commercial
 FROM valid v JOIN dealer_seed s ON s.rut=v.body
 GROUP BY v.body HAVING count(DISTINCT v.dv)=1
)
INSERT INTO dealers_master(rut_normalizado,rut_dv,razon_social_canonica,nombre_comercial,identity_status)
SELECT body,dv,canonical,commercial,'rut_validated' FROM known
ON CONFLICT(rut_normalizado) DO UPDATE SET rut_dv=excluded.rut_dv,identity_status='rut_validated',updated_at=now();

WITH forum AS (
 SELECT comentario,master_rut((regexp_match(comentario,'([0-9]{1,2}\\.?[0-9]{3}\\.?[0-9]{3}-?[0-9Kk])'))[1]) full_rut
 FROM notas_venta_raw WHERE master_norm(razon_social)='FÓRUM DISTRIBUIDORA S.A.' AND comentario IS NOT NULL
), valid AS (
 SELECT comentario,left(full_rut,-1) body FROM forum WHERE master_rut_valid(full_rut)
)
INSERT INTO dealer_aliases(dealer_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,validated)
SELECT d.dealer_id,'notas_venta_raw.forum',min(v.comentario),master_norm(min(v.comentario)),'forum_comment','validated_rut_in_comment',true
FROM valid v JOIN dealers_master d ON d.rut_normalizado=v.body AND d.identity_status='rut_validated' GROUP BY d.dealer_id
ON CONFLICT(fuente,tipo_alias,valor_normalizado) DO NOTHING;

WITH forum AS (
 SELECT comentario,master_rut((regexp_match(comentario,'([0-9]{1,2}\\.?[0-9]{3}\\.?[0-9]{3}-?[0-9Kk])'))[1]) full_rut
 FROM notas_venta_raw WHERE master_norm(razon_social)='FÓRUM DISTRIBUIDORA S.A.' AND comentario IS NOT NULL
), valid AS (
 SELECT full_rut,left(full_rut,-1) body,count(*) obs FROM forum WHERE master_rut_valid(full_rut) GROUP BY full_rut
)
INSERT INTO master_conflicts(dominio,natural_key,conflict_type,evidence)
SELECT 'dealer',v.body,'validated_forum_rut_without_known_dealer',jsonb_build_object('rut',v.full_rut,'observations',v.obs)
FROM valid v LEFT JOIN dealers_master d ON d.rut_normalizado=v.body WHERE d.dealer_id IS NULL
ON CONFLICT(dominio,natural_key,conflict_type) DO UPDATE SET evidence=excluded.evidence,updated_at=now();

COMMIT;
