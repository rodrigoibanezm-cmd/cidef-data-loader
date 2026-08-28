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

WITH observed AS (
 SELECT DISTINCT s.* FROM dealer_seed s JOIN notas_venta_raw n ON master_rut(n.cliente)=s.rut
)
INSERT INTO dealers_master(rut_normalizado,razon_social_canonica,nombre_comercial,identity_status)
SELECT rut,canonical,commercial,'body_only' FROM observed ON CONFLICT(rut_normalizado) DO NOTHING;

INSERT INTO dealer_aliases(dealer_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,validated)
SELECT d.dealer_id,'notas_venta_raw',min(n.razon_social),master_norm(n.razon_social),'razon_social','known_rut_body',true
FROM notas_venta_raw n JOIN dealers_master d ON d.rut_normalizado=master_rut(n.cliente)
WHERE master_norm(n.razon_social) IS NOT NULL AND master_norm(n.razon_social) <> 'FÓRUM DISTRIBUIDORA S.A.'
GROUP BY d.dealer_id,master_norm(n.razon_social)
ON CONFLICT(fuente,tipo_alias,valor_normalizado) DO NOTHING;

WITH forum AS (
 SELECT comentario,
        master_rut((regexp_match(comentario,'([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-?[0-9Kk])'))[1]) full_rut
 FROM notas_venta_raw WHERE master_norm(razon_social)='FÓRUM DISTRIBUIDORA S.A.' AND comentario IS NOT NULL
), valid AS (
 SELECT comentario,full_rut,left(full_rut,-1) body,right(full_rut,1) dv FROM forum WHERE master_rut_valid(full_rut)
)
UPDATE dealers_master d SET rut_dv=v.dv,identity_status='rut_validated',updated_at=now()
FROM (SELECT body,min(dv) dv FROM valid GROUP BY body HAVING count(DISTINCT dv)=1) v WHERE d.rut_normalizado=v.body;

WITH forum AS (
 SELECT comentario,master_rut((regexp_match(comentario,'([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-?[0-9Kk])'))[1]) full_rut
 FROM notas_venta_raw WHERE master_norm(razon_social)='FÓRUM DISTRIBUIDORA S.A.' AND comentario IS NOT NULL
), valid AS (
 SELECT comentario,left(full_rut,-1) body FROM forum WHERE master_rut_valid(full_rut)
)
INSERT INTO dealer_aliases(dealer_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,validated)
SELECT d.dealer_id,'notas_venta_raw.forum',min(v.comentario),master_norm(min(v.comentario)),'forum_comment','validated_rut_in_comment',true
FROM valid v JOIN dealers_master d ON d.rut_normalizado=v.body GROUP BY d.dealer_id
ON CONFLICT(fuente,tipo_alias,valor_normalizado) DO NOTHING;

WITH forum AS (
 SELECT comentario,master_rut((regexp_match(comentario,'([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-?[0-9Kk])'))[1]) full_rut
 FROM notas_venta_raw WHERE master_norm(razon_social)='FÓRUM DISTRIBUIDORA S.A.' AND comentario IS NOT NULL
), valid AS (
 SELECT full_rut,left(full_rut,-1) body,count(*) obs FROM forum WHERE master_rut_valid(full_rut) GROUP BY full_rut
)
INSERT INTO master_conflicts(dominio,natural_key,conflict_type,evidence)
SELECT 'dealer',v.body,'validated_forum_rut_without_known_dealer',jsonb_build_object('rut',v.full_rut,'observations',v.obs)
FROM valid v LEFT JOIN dealers_master d ON d.rut_normalizado=v.body WHERE d.dealer_id IS NULL
ON CONFLICT(dominio,natural_key,conflict_type) DO UPDATE SET evidence=excluded.evidence,updated_at=now();

COMMIT;
