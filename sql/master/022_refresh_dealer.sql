BEGIN;

DELETE FROM dealer_supervisor;
DELETE FROM dealer_aliases;
DELETE FROM dealers_master;
DELETE FROM dealer_groups;
DELETE FROM master_conflicts WHERE dominio='dealer';

INSERT INTO dealer_groups(nombre_canonico,nombre_normalizado) VALUES
('AUTOMOTRIZ FOR CENTER','AUTOMOTRIZ FOR CENTER'),('CARPOINT','CARPOINT'),('MELHUISH','MELHUISH'),
('AUTOMOTRIZ PORTILLO SUR','AUTOMOTRIZ PORTILLO SUR'),('AUTOS OGAZ','AUTOS OGAZ'),
('RENTAL BASILIO','RENTAL BASILIO'),('CITY MOTOR','CITY MOTOR'),('VEGA ARTUS','VEGA ARTUS'),
('VARAS HERMANOS','VARAS HERMANOS'),('COMERCIAL COLON','COMERCIAL COLON'),
('AUTOMOTRIZ AUSTRAL','AUTOMOTRIZ AUSTRAL'),('GELLONA','GELLONA'),
('AUTOMOTRIZ CARMONA','AUTOMOTRIZ CARMONA'),('AUTOMECANICA COLON','AUTOMECANICA COLON'),
('AUTOMOTRIZ CORDILLERA','AUTOMOTRIZ CORDILLERA'),('ROMANINI','ROMANINI'),
('GRASS & ARUESTE','GRASS & ARUESTE'),('CURIFOR','CURIFOR'),('AUTOMOTRIZ ROSSELOT','AUTOMOTRIZ ROSSELOT'),
('IMPORT & EXPORT','IMPORT & EXPORT'),('PIAMONTE','PIAMONTE'),('KLASSIK CAR','KLASSIK CAR');

CREATE TEMP TABLE dealer_seed(rut text, commercial text, grp text, supervisor text) ON COMMIT DROP;
INSERT INTO dealer_seed VALUES
('76068841',NULL,'AUTOMOTRIZ FOR CENTER','JWEBER'),('76188205','CARPOINT','CARPOINT','GBERMUDEZ'),
('76281300','MELHUISH','MELHUISH','JWEBER'),('76296863',NULL,'AUTOMOTRIZ PORTILLO SUR','JWEBER'),
('76306357','MELHUISH','MELHUISH','JWEBER'),('76406005','AUTOS OGAZ','AUTOS OGAZ','JWEBER'),
('76506740','AUTOS OGAZ','AUTOS OGAZ','JWEBER'),('76537562','RENTAL BASILIO','RENTAL BASILIO','JWEBER'),
('76719932','CITY MOTOR','CITY MOTOR',NULL),('76810800','VEGA ARTUS','VEGA ARTUS','JWEBER'),
('76998631','VARAS HERMANOS','VARAS HERMANOS','GBERMUDEZ'),('77244120',NULL,'COMERCIAL COLON','GBERMUDEZ'),
('78071163',NULL,'AUTOMOTRIZ AUSTRAL','JWEBER'),('78189900','GELLONA','GELLONA','JWEBER'),
('79528950',NULL,'AUTOMOTRIZ CARMONA','GBERMUDEZ'),('79600500','AUTOMECÁNICA COLON','AUTOMECANICA COLON','GBERMUDEZ'),
('79853470',NULL,'AUTOMOTRIZ CORDILLERA',NULL),('85234600','ROMANINI','ROMANINI','GBERMUDEZ'),
('88867500',NULL,'GRASS & ARUESTE','JWEBER'),('92909000','CURIFOR','CURIFOR','GBERMUDEZ'),
('96502140',NULL,'AUTOMOTRIZ ROSSELOT','GBERMUDEZ'),('96639090','IMPORT & EXPORT','IMPORT & EXPORT','GBERMUDEZ'),
('96642160','PIAMONTE','PIAMONTE','GBERMUDEZ'),('96668460',NULL,'KLASSIK CAR','JWEBER');

WITH observed AS (
 SELECT regexp_replace(trim(rut),'[^0-9]','','g') rut,min(trim(cliente)) canonical,
        count(DISTINCT trim(cliente)) names,count(DISTINCT vin_chasis) vins
 FROM vehiculos_raw WHERE nullif(trim(vin_chasis),'') IS NOT NULL GROUP BY 1
)
INSERT INTO dealers_master(rut_normalizado,rut_dv,razon_social_canonica,nombre_comercial,identity_status,dealer_group_id)
SELECT s.rut,NULL,o.canonical,s.commercial,'body_only',g.dealer_group_id
FROM dealer_seed s JOIN observed o USING(rut) JOIN dealer_groups g ON g.nombre_normalizado=s.grp
WHERE o.names=1;

INSERT INTO dealer_aliases(dealer_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,validated)
SELECT dealer_id,'vehiculos_raw',razon_social_canonica,master_norm(razon_social_canonica),'razon_social','exact_rut_body',true
FROM dealers_master;
INSERT INTO dealer_aliases(dealer_id,fuente,valor_raw,valor_normalizado,tipo_alias,match_method,validated)
SELECT dealer_id,'respaldo.dealers_master',nombre_comercial,master_norm(nombre_comercial),'nombre_comercial','historical_master_revalidated_raw',true
FROM dealers_master WHERE nombre_comercial IS NOT NULL;

INSERT INTO dealer_supervisor(dealer_id,persona_id,vigente,fuente)
SELECT d.dealer_id,p.persona_id,true,'respaldo.dealers_master'
FROM dealer_seed s JOIN dealers_master d ON d.rut_normalizado=s.rut
JOIN personas_master p ON p.usuario_canonico=s.supervisor AND p.validated=true
WHERE s.supervisor IS NOT NULL;

INSERT INTO master_conflicts(dominio,natural_key,conflict_type,evidence)
VALUES ('dealer','79853470','supervisor_not_person',jsonb_build_object('supervisor_raw','Oficina','source','respaldo.dealers_master'));

COMMIT;
