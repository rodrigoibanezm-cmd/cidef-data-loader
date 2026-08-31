BEGIN;

CREATE TABLE IF NOT EXISTS public.vehiculo_canonico (
  vehiculo_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vin text NOT NULL UNIQUE,
  version_id bigint NULL REFERENCES public.versiones_master_v01(version_id),
  producto_match_method text NULL,
  producto_conflicto boolean NOT NULL DEFAULT false,
  nro_stock text NOT NULL,
  marca_raw text NOT NULL,
  modelo_raw text NOT NULL,
  patente text NULL,
  ano_raw text NULL,
  color_raw text NULL,
  etapa text NOT NULL,
  bodega_fuente text NOT NULL,
  vigente boolean NOT NULL,
  fecha_ingreso_stock timestamp without time zone NULL,
  fecha_eta timestamp without time zone NULL,
  fecha_nv timestamp without time zone NULL,
  nota_de_venta text NULL,
  factura_tipo text NULL,
  numero_factura text NULL,
  fecha_factura timestamp without time zone NULL,
  fecha_entrega_planificada timestamp without time zone NULL,
  pendiente_entrega boolean NULL,
  esta_fisico_raw text NULL,
  esta_reservado boolean NOT NULL,
  esta_en_transito boolean NOT NULL,
  en_patio boolean NOT NULL,
  tipo_ficha text NULL,
  source_table text NOT NULL DEFAULT 'vehiculos_raw',
  source_vin_raw text NOT NULL,
  canonicalized_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ck_vehiculo_canonico_vin_format CHECK (length(vin)=17 AND vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  CONSTRAINT ck_vehiculo_canonico_producto_conflict CHECK (NOT producto_conflicto OR version_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_vehiculo_canonico_version_id ON public.vehiculo_canonico(version_id);
CREATE INDEX IF NOT EXISTS idx_vehiculo_canonico_vigente ON public.vehiculo_canonico(vigente);
CREATE INDEX IF NOT EXISTS idx_vehiculo_canonico_etapa ON public.vehiculo_canonico(etapa);
CREATE INDEX IF NOT EXISTS idx_vehiculo_canonico_bodega ON public.vehiculo_canonico(bodega_fuente);
CREATE INDEX IF NOT EXISTS idx_vehiculo_canonico_nv ON public.vehiculo_canonico(nota_de_venta);
CREATE INDEX IF NOT EXISTS idx_vehiculo_canonico_factura ON public.vehiculo_canonico(numero_factura);

WITH base AS (
  SELECT upper(btrim(vin_chasis)) AS vin, v.*
  FROM public.vehiculos_raw v
  WHERE vin_chasis IS NOT NULL
    AND btrim(vin_chasis) <> ''
    AND length(upper(btrim(vin_chasis))) = 17
    AND upper(btrim(vin_chasis)) ~ '^[A-HJ-NPR-Z0-9]{17}$'
),
direct_map AS (
  SELECT upper(btrim(contexto_marca_raw)) AS marca_n,
         upper(btrim(valor_raw)) AS valor_n,
         min(version_id) AS version_id
  FROM public.producto_aliases_v01
  WHERE fuente='vehiculos_raw' AND nivel='VERSION' AND estado='RESUELTO'
  GROUP BY 1,2
  HAVING count(DISTINCT version_id)=1
),
ventas_map AS (
  SELECT upper(btrim(contexto_marca_raw)) AS marca_n,
         upper(btrim(valor_raw)) AS valor_n,
         min(version_id) AS version_id
  FROM public.producto_aliases_v01
  WHERE fuente='ventas_raw' AND nivel='VERSION' AND estado='RESUELTO'
  GROUP BY 1,2
  HAVING count(DISTINCT version_id)=1
),
nv_map AS (
  SELECT upper(btrim(contexto_marca_raw)) AS marca_n,
         upper(btrim(valor_raw)) AS valor_n,
         min(version_id) AS version_id
  FROM public.producto_aliases_v01
  WHERE fuente='notas_venta_raw' AND nivel='VERSION' AND estado='RESUELTO'
  GROUP BY 1,2
  HAVING count(DISTINCT version_id)=1
),
ventas_vin AS (
  SELECT DISTINCT upper(btrim(v.nro_vin_chasis)) AS vin, vm.version_id
  FROM public.ventas_raw v
  JOIN ventas_map vm
    ON vm.marca_n=upper(btrim(v.desc_mae_marca))
   AND vm.valor_n=upper(btrim(v.desc_articulo))
  WHERE v.nro_vin_chasis IS NOT NULL AND btrim(v.nro_vin_chasis)<>''
),
nv_vin AS (
  SELECT DISTINCT upper(btrim(n.chasis)) AS vin, nm.version_id
  FROM public.notas_venta_raw n
  JOIN nv_map nm
    ON nm.marca_n=upper(btrim(n.desc_mae_marca))
   AND nm.valor_n=upper(btrim(n.modelo_comercial))
  WHERE n.chasis IS NOT NULL AND btrim(n.chasis)<>''
),
candidates AS (
  SELECT b.vin,
         dm.version_id AS direct_version,
         array_remove(array_agg(DISTINCT vv.version_id),NULL) AS ventas_versions,
         array_remove(array_agg(DISTINCT nn.version_id),NULL) AS nv_versions
  FROM base b
  LEFT JOIN direct_map dm
    ON dm.marca_n=upper(btrim(b.marca))
   AND dm.valor_n=upper(btrim(b.modelo))
  LEFT JOIN ventas_vin vv ON vv.vin=b.vin
  LEFT JOIN nv_vin nn ON nn.vin=b.vin
  GROUP BY b.vin, dm.version_id
),
resolved AS (
  SELECT c.vin,
         CASE WHEN cardinality(all_versions)=1 THEN all_versions[1] ELSE NULL END AS version_id,
         CASE
           WHEN cardinality(all_versions)>1 THEN 'CONFLICTO_CROSS_SOURCE'
           WHEN c.direct_version IS NOT NULL THEN 'VEHICULOS_RAW_ALIAS'
           WHEN cardinality(c.ventas_versions)>0 THEN 'VIN_CROSS_SOURCE_VENTAS'
           WHEN cardinality(c.nv_versions)>0 THEN 'VIN_CROSS_SOURCE_NOTAS'
           ELSE NULL
         END AS producto_match_method,
         cardinality(all_versions)>1 AS producto_conflicto
  FROM candidates c
  CROSS JOIN LATERAL (
    SELECT ARRAY(
      SELECT DISTINCT x
      FROM unnest(
        array_cat(
          array_cat(CASE WHEN c.direct_version IS NULL THEN ARRAY[]::bigint[] ELSE ARRAY[c.direct_version] END, c.ventas_versions),
          c.nv_versions
        )
      ) x
      ORDER BY x
    ) AS all_versions
  ) q
),
source_rows AS (
  SELECT
    b.vin,
    r.version_id,
    r.producto_match_method,
    r.producto_conflicto,
    btrim(b.nro_stock) AS nro_stock,
    btrim(b.marca) AS marca_raw,
    btrim(b.modelo) AS modelo_raw,
    nullif(btrim(b.patente),'') AS patente,
    nullif(btrim(b.ano),'') AS ano_raw,
    nullif(btrim(b.color),'') AS color_raw,
    btrim(b.etapa) AS etapa,
    btrim(b.bodega) AS bodega_fuente,
    CASE btrim(b.vigente) WHEN '1' THEN true WHEN '0' THEN false END AS vigente,
    CASE WHEN b.fecha_ingreso_stk IS NULL OR btrim(b.fecha_ingreso_stk)='' THEN NULL ELSE to_timestamp(btrim(b.fecha_ingreso_stk),'MM/DD/YY HH24:MI')::timestamp END AS fecha_ingreso_stock,
    CASE WHEN b.fecha_eta IS NULL OR btrim(b.fecha_eta)='' THEN NULL ELSE to_timestamp(btrim(b.fecha_eta),'MM/DD/YY HH24:MI')::timestamp END AS fecha_eta,
    CASE WHEN b.fecha_nv IS NULL OR btrim(b.fecha_nv)='' THEN NULL ELSE to_timestamp(btrim(b.fecha_nv),'MM/DD/YY HH24:MI')::timestamp END AS fecha_nv,
    nullif(btrim(b.nota_de_venta),'') AS nota_de_venta,
    nullif(btrim(b.factura),'') AS factura_tipo,
    nullif(btrim(b.numero_factura),'') AS numero_factura,
    CASE WHEN b.fecha_factura IS NULL OR btrim(b.fecha_factura)='' THEN NULL ELSE to_timestamp(btrim(b.fecha_factura),'MM/DD/YY HH24:MI')::timestamp END AS fecha_factura,
    CASE WHEN b.fecha_entrega_planificada IS NULL OR btrim(b.fecha_entrega_planificada)='' THEN NULL ELSE to_timestamp(btrim(b.fecha_entrega_planificada),'MM/DD/YY HH24:MI')::timestamp END AS fecha_entrega_planificada,
    CASE btrim(coalesce(b.pendiente_entrega,'')) WHEN '1' THEN true WHEN '0' THEN false ELSE NULL END AS pendiente_entrega,
    nullif(btrim(b.esta_fisico),'') AS esta_fisico_raw,
    CASE btrim(b.esta_reservado) WHEN '1' THEN true WHEN '0' THEN false END AS esta_reservado,
    CASE btrim(b.esta_en_transito) WHEN '1' THEN true WHEN '0' THEN false END AS esta_en_transito,
    CASE btrim(b.en_patio) WHEN '1' THEN true WHEN '0' THEN false END AS en_patio,
    nullif(btrim(b.tipo_ficha),'') AS tipo_ficha,
    b.vin_chasis AS source_vin_raw
  FROM base b
  JOIN resolved r USING (vin)
)
INSERT INTO public.vehiculo_canonico (
  vin,version_id,producto_match_method,producto_conflicto,nro_stock,marca_raw,modelo_raw,
  patente,ano_raw,color_raw,etapa,bodega_fuente,vigente,fecha_ingreso_stock,fecha_eta,
  fecha_nv,nota_de_venta,factura_tipo,numero_factura,fecha_factura,fecha_entrega_planificada,
  pendiente_entrega,esta_fisico_raw,esta_reservado,esta_en_transito,en_patio,tipo_ficha,source_vin_raw
)
SELECT
  vin,version_id,producto_match_method,producto_conflicto,nro_stock,marca_raw,modelo_raw,
  patente,ano_raw,color_raw,etapa,bodega_fuente,vigente,fecha_ingreso_stock,fecha_eta,
  fecha_nv,nota_de_venta,factura_tipo,numero_factura,fecha_factura,fecha_entrega_planificada,
  pendiente_entrega,esta_fisico_raw,esta_reservado,esta_en_transito,en_patio,tipo_ficha,source_vin_raw
FROM source_rows
ON CONFLICT (vin) DO UPDATE SET
  version_id=excluded.version_id,
  producto_match_method=excluded.producto_match_method,
  producto_conflicto=excluded.producto_conflicto,
  nro_stock=excluded.nro_stock,
  marca_raw=excluded.marca_raw,
  modelo_raw=excluded.modelo_raw,
  patente=excluded.patente,
  ano_raw=excluded.ano_raw,
  color_raw=excluded.color_raw,
  etapa=excluded.etapa,
  bodega_fuente=excluded.bodega_fuente,
  vigente=excluded.vigente,
  fecha_ingreso_stock=excluded.fecha_ingreso_stock,
  fecha_eta=excluded.fecha_eta,
  fecha_nv=excluded.fecha_nv,
  nota_de_venta=excluded.nota_de_venta,
  factura_tipo=excluded.factura_tipo,
  numero_factura=excluded.numero_factura,
  fecha_factura=excluded.fecha_factura,
  fecha_entrega_planificada=excluded.fecha_entrega_planificada,
  pendiente_entrega=excluded.pendiente_entrega,
  esta_fisico_raw=excluded.esta_fisico_raw,
  esta_reservado=excluded.esta_reservado,
  esta_en_transito=excluded.esta_en_transito,
  en_patio=excluded.en_patio,
  tipo_ficha=excluded.tipo_ficha,
  source_vin_raw=excluded.source_vin_raw,
  source_table='vehiculos_raw',
  canonicalized_at=now();

DELETE FROM public.vehiculo_canonico vc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.vehiculos_raw vr
  WHERE vr.vin_chasis IS NOT NULL
    AND btrim(vr.vin_chasis)<>''
    AND length(upper(btrim(vr.vin_chasis)))=17
    AND upper(btrim(vr.vin_chasis)) ~ '^[A-HJ-NPR-Z0-9]{17}$'
    AND upper(btrim(vr.vin_chasis))=vc.vin
);

COMMIT;
