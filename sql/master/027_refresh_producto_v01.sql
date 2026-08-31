BEGIN;

TRUNCATE TABLE producto_portafolio_v01, producto_clasificacion_v01, producto_aliases_v01,
  versiones_master_v01, modelos_master_v01, marcas_master_v01 RESTART IDENTITY CASCADE;

-- REGLA
-- 1. Lista de precios vigente = canonico CIDEF para marca/modelo/version y portafolio vigente.
-- 2. RVM = universo mercado y evidencia externa.
-- 3. Cuando existe producto CIDEF equivalente, nomenclatura RVM se normaliza al canonico CIDEF.
-- 4. EV es identidad distinta. No colapsar MAGE/MAGE EV, S50/S50 EV, G7/G7 EV.
-- 5. Fuera del portafolio CIDEF, RVM define identidad de mercado.

CREATE TEMP TABLE _cidef_portfolio (
  marca text NOT NULL,
  modelo text NOT NULL,
  version text NOT NULL
) ON COMMIT DROP;

INSERT INTO _cidef_portfolio(marca,modelo,version) VALUES
('FOTON','MIDI','CABINA SIMPLE 1.2 EURO VI'),
('FOTON','MIDI','CABINA DOBLE 1.2 EURO VI'),
('FOTON','MIDI','MIDI CARGO BOX'),
('FOTON','MIDI','MIDI CARGO BOX REF 1.2 EURO VI'),
('FOTON','TM3','CABINA SIMPLE 1.6 EURO VI'),
('FOTON','TM3','CABINA SIMPLE 1.6 EURO VI 2 AIRBAG'),
('FOTON','TM3','CABINA DOBLE 1.6 EURO VI'),
('FOTON','TM3','CABINA DOBLE 1.6 EURO VI 2 AIRBAG'),
('FOTON','TM3','TM3 CARGO BOX'),
('FOTON','TM3','TM3 REFRIGERADO'),
('FOTON','TM5','CARGO BOX'),
('FOTON','WONDER','CABINA SIMPLE CHASIS 1.6 E6'),
('FOTON','WONDER','CABINA SIMPLE 1.6 E6'),
('FOTON','WONDER','CABINA DOBLE 1.6 E6'),
('FOTON','WONDER','CARGO BOX 1.6 E6'),
('FOTON','K1','K1 CARGO DIESEL'),
('FOTON','FT','FT BOX CARGO DIESEL'),
('FOTON','FT','FT CREW PASAJEROS EURO'),
('FOTON','G7','LITE 4X2 EURO VI'),
('FOTON','G7','LITE 4X4 EURO VI'),
('FOTON','G7','ULTIMATE 4X2 EURO VI'),
('FOTON','G7','ULTIMATE 4X4 EURO VI'),
('FOTON','G7','ULTIMATE AT 4X4 EURO VI'),
('FOTON','G9','G9 4X2 MT'),
('FOTON','G9','G9 4X4 MT'),
('FOTON','G9','G9 4X4 AT'),
('FOTON','V7','LUXURY MT 4X4'),
('FOTON','V7','ELITE AT 4X4'),
('FOTON','V7','LUXURY AT 4X4'),
('FOTON','V9','ULTIMATE AT 4X4'),
('FOTON','G7 EV','G7 EV 4X2'),
('FOTON','VIEW GRAND','VIEW GRAND CARGO L2H1 (TECHO BAJO) MT'),
('FOTON','VIEW GRAND','VIEW GRAND CARGO L2H2 (TECHO ALTO) MT'),
('FOTON','VIEW GRAND','VIEW GRAND CARGO L2H2 (TECHO ALTO) AT'),
('FOTON','VIEW GRAND','VIEW GRAND PASSENGER L2H3 MT 9 PASAJEROS'),
('FOTON','VIEW GRAND','VIEW GRAND PASAJERO L2H2 MT 12 PASAJEROS'),
('FOTON','VIEW GRAND','VIEW GRAND PASSENGER L2H3 AT 9 PASAJEROS'),
('FOTON','VIEW GRAND','VIEW GRAND PASAJERO L2H2 AT 12 PASAJEROS'),
('DONGFENG','AEOLUS Y3','AEOLUS Y3 MT'),
('DONGFENG','AEOLUS Y3','AEOLUS Y3 AT COMFORT'),
('DONGFENG','AEOLUS Y3','AEOLUS Y3 AT LUXURY'),
('DONGFENG','AEOLUS GS','AEOLUS GS CROSS'),
('DONGFENG','T5','T5 1.6 EURO VI'),
('DONGFENG','T5 L','T5 L 1.8 TURBO EURO VI'),
('DONGFENG','T5 L','T5 L 1.5 AT EURO VI'),
('DONGFENG','T5 L','T5 L 1.5 TURBO EURO VI'),
('DONGFENG','T5 EVO','T5 EVO 1.5 TURBO LUXURY EURO VI'),
('DONGFENG','T5 EVO','T5 EVO 1.5 TURBO NOBLE EURO VI'),
('DONGFENG','T5 EVO','T5 EVO 1.5 HEV'),
('DONGFENG','T5 EVO','T5 EVO 1.5 TURBO MT LUXURY EURO VI'),
('DONGFENG','SX6','NEW SX6 1.6'),
('DONGFENG','MAGE','MAGE 1.5T E1'),
('DONGFENG','MAGE','MAGE 1.5T E2'),
('DONGFENG','MAGE','MAGE 1.5T E2 BICOLOR'),
('DONGFENG','HUGE','HUGE ICE E1 1.5T'),
('DONGFENG','HUGE','HUGE ICE E2 1.5T'),
('DONGFENG','RICH 6','RICH 6 MT 4X2 EURO VI'),
('DONGFENG','RICH 6','RICH 6 MT 4X4 EURO VI'),
('DONGFENG','RICH 6','RICH 6 AT 4X4 EURO VI'),
('DONGFENG','S50 EV','S50 EV'),
('DONGFENG','MAGE EV','MAGE EV');

CREATE TEMP TABLE _rvm_norm AS
SELECT
  r.*,
  CASE
    WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG') THEN 'DONGFENG'
    WHEN master_norm(r.marca)='ZNA'
      AND master_norm(r.modelo_homologado) IN ('NEW RICH','DF6')
      AND master_norm(r.modeo_version) LIKE 'RICH 6%' THEN 'DONGFENG'
    WHEN master_norm(r.marca) IN ('LEAP MOTOR','LEAPMOTOR') THEN 'LEAPMOTOR'
    ELSE master_norm(r.marca)
  END AS marca_canon,
  CASE
    WHEN master_norm(r.marca)='ZNA'
      AND master_norm(r.modelo_homologado) IN ('NEW RICH','DF6')
      AND master_norm(r.modeo_version) LIKE 'RICH 6%' THEN 'RICH 6'
    WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
      AND master_norm(r.modelo_homologado)='DF6'
      AND master_norm(r.modeo_version) LIKE 'RICH 6%' THEN 'RICH 6'
    WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
      AND master_norm(r.modelo_homologado)='T5L' THEN 'T5 L'
    WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
      AND master_norm(r.modelo_homologado)='T5 EVO'
      AND master_norm(r.modeo_version) LIKE 'T5 1.6%' THEN 'T5'
    WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
      AND master_norm(r.modelo_homologado)='MAGE'
      AND master_norm(r.modeo_version) LIKE '%MAGE EV%' THEN 'MAGE EV'
    WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
      AND master_norm(r.modelo_homologado)='S50'
      AND EXISTS (
        SELECT 1 FROM vehiculos_raw v
        WHERE master_norm(v.vin_chasis)=master_norm(r.vin)
          AND master_norm(v.modelo)='MAGE EV'
      ) THEN 'MAGE EV'
    WHEN master_norm(r.marca) IN ('DFM','DONG FENG','DONGFENG')
      AND master_norm(r.modelo_homologado)='S50'
      AND master_norm(r.modeo_version) LIKE '%S50 EV%' THEN 'S50 EV'
    WHEN master_norm(r.marca)='FOTON'
      AND master_norm(r.modelo_homologado)='FOTON G7'
      AND master_norm(r.modeo_version) LIKE '%EV%' THEN 'G7 EV'
    WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='FOTON G7' THEN 'G7'
    WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='VIEW' THEN 'VIEW GRAND'
    WHEN master_norm(r.marca)='FOTON' AND master_norm(r.modelo_homologado)='FOTON FURGON FT' THEN 'FT'
    ELSE master_norm(r.modelo_homologado)
  END AS modelo_canon
FROM rvm_raw r;

INSERT INTO marcas_master_v01(nombre_canonico,nombre_normalizado)
SELECT min(marca_canon),marca_canon
FROM _rvm_norm
WHERE marca_canon IS NOT NULL
GROUP BY marca_canon;

INSERT INTO marcas_master_v01(nombre_canonico,nombre_normalizado)
SELECT marca,master_norm(marca) FROM _cidef_portfolio
GROUP BY marca
ON CONFLICT(nombre_normalizado) DO NOTHING;

INSERT INTO modelos_master_v01(marca_id,nombre_canonico,nombre_normalizado)
SELECT ma.marca_id,min(r.modelo_canon),r.modelo_canon
FROM _rvm_norm r
JOIN marcas_master_v01 ma ON ma.nombre_normalizado=r.marca_canon
WHERE r.modelo_canon IS NOT NULL
GROUP BY ma.marca_id,r.modelo_canon;

INSERT INTO modelos_master_v01(marca_id,nombre_canonico,nombre_normalizado)
SELECT ma.marca_id,p.modelo,master_norm(p.modelo)
FROM _cidef_portfolio p
JOIN marcas_master_v01 ma ON ma.nombre_normalizado=master_norm(p.marca)
GROUP BY ma.marca_id,p.modelo
ON CONFLICT(marca_id,nombre_normalizado) DO UPDATE
SET nombre_canonico=excluded.nombre_canonico,updated_at=now();

-- RVM conserva su version como identidad de mercado salvo cuando existe canonico CIDEF validado.
INSERT INTO versiones_master_v01(modelo_id,nombre_canonico,nombre_normalizado)
SELECT mo.modelo_id,min(trim(r.modeo_version)),master_norm(r.modeo_version)
FROM _rvm_norm r
JOIN marcas_master_v01 ma ON ma.nombre_normalizado=r.marca_canon
JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id AND mo.nombre_normalizado=r.modelo_canon
WHERE master_norm(r.modeo_version) IS NOT NULL
GROUP BY mo.modelo_id,master_norm(r.modeo_version);

-- La lista de precios reemplaza/añade la identidad comercial CIDEF.
INSERT INTO versiones_master_v01(modelo_id,nombre_canonico,nombre_normalizado)
SELECT mo.modelo_id,p.version,master_norm(p.version)
FROM _cidef_portfolio p
JOIN marcas_master_v01 ma ON ma.nombre_normalizado=master_norm(p.marca)
JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id AND mo.nombre_normalizado=master_norm(p.modelo)
ON CONFLICT(modelo_id,nombre_normalizado) DO UPDATE
SET nombre_canonico=excluded.nombre_canonico,updated_at=now();

INSERT INTO producto_portafolio_v01(
  marca_id,modelo_id,version_id,organizacion,valid_from,vigente,fuente,documento_origen
)
SELECT ma.marca_id,mo.modelo_id,ve.version_id,'CIDEF',DATE '2026-08-05',true,
       'LISTA_PRECIOS','LISTA DE PRECIOS AGOSTO 05-08-2026.xlsb'
FROM _cidef_portfolio p
JOIN marcas_master_v01 ma ON ma.nombre_normalizado=master_norm(p.marca)
JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id AND mo.nombre_normalizado=master_norm(p.modelo)
JOIN versiones_master_v01 ve ON ve.modelo_id=mo.modelo_id AND ve.nombre_normalizado=master_norm(p.version);

-- Alias de marca RVM.
INSERT INTO producto_aliases_v01(
  nivel,fuente,valor_raw,valor_normalizado,marca_id,evidencia_tipo,evidencia_count,
  primera_observacion,ultima_observacion,estado
)
SELECT 'MARCA','rvm_raw',r.marca,master_norm(r.marca),ma.marca_id,'OBSERVADO_RVM',count(*),
       min(r.fecha),max(r.fecha),'RESUELTO'
FROM _rvm_norm r
JOIN marcas_master_v01 ma ON ma.nombre_normalizado=r.marca_canon
GROUP BY r.marca,ma.marca_id;

-- Alias de modelo RVM. El contexto de version evita colapsar EV/no-EV cuando RVM usa el mismo modelo.
INSERT INTO producto_aliases_v01(
  nivel,fuente,valor_raw,valor_normalizado,contexto_marca_raw,contexto_modelo_raw,
  marca_id,modelo_id,evidencia_tipo,evidencia_count,primera_observacion,ultima_observacion,estado
)
SELECT 'MODELO','rvm_raw',r.modelo_homologado,master_norm(r.modelo_homologado),r.marca,
       CASE WHEN r.modelo_canon<>master_norm(r.modelo_homologado) THEN r.modeo_version ELSE NULL END,
       ma.marca_id,mo.modelo_id,'OBSERVADO_RVM',count(*),min(r.fecha),max(r.fecha),'RESUELTO'
FROM _rvm_norm r
JOIN marcas_master_v01 ma ON ma.nombre_normalizado=r.marca_canon
JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id AND mo.nombre_normalizado=r.modelo_canon
WHERE master_norm(r.modelo_homologado) IS NOT NULL
GROUP BY r.modelo_homologado,r.marca,
         CASE WHEN r.modelo_canon<>master_norm(r.modelo_homologado) THEN r.modeo_version ELSE NULL END,
         ma.marca_id,mo.modelo_id;

-- Taxonomia observada RVM; no redefine identidad.
INSERT INTO producto_clasificacion_v01(
  marca_id,modelo_id,taxonomia,valor,fuente,valid_from,valid_to,estado
)
SELECT ma.marca_id,mo.modelo_id,x.taxonomia,x.valor,'rvm_raw',min(r.fecha),max(r.fecha),'OBSERVADO'
FROM _rvm_norm r
JOIN marcas_master_v01 ma ON ma.nombre_normalizado=r.marca_canon
JOIN modelos_master_v01 mo ON mo.marca_id=ma.marca_id AND mo.nombre_normalizado=r.modelo_canon
CROSS JOIN LATERAL (VALUES
  ('SEGMENTO',master_norm(r.descripcion_segmento)),
  ('TIPO',master_norm(r.descripcion_tipo)),
  ('COMBUSTIBLE',master_norm(r.combustible))
) x(taxonomia,valor)
WHERE x.valor IS NOT NULL
GROUP BY ma.marca_id,mo.modelo_id,x.taxonomia,x.valor;

COMMIT;
