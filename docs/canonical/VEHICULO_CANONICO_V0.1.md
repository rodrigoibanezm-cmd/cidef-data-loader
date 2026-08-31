# VEHICULO_CANONICO_V0.1

## ESTADO

**IMPLEMENTADO / VALIDADO — 2026-08-31**

Tabla física: `public.vehiculo_canonico` en Neon `main`.

## GRAIN

```text
1 fila = 1 VIN válido actual observado en vehiculos_raw
```

No mantiene snapshots diarios.

## CLAVES

- PK técnica: `vehiculo_id`.
- Clave natural: `vin` normalizado `upper(trim(vin_chasis))`, UNIQUE.
- VIN válido V0.1: 17 caracteres y patrón `^[A-HJ-NPR-Z0-9]{17}$`.

## UNIVERSO

Fuente base autoritativa de estado actual: `vehiculos_raw`.

Reconciliación inicial:

```text
vehiculos_raw filas          = 46.390
VIN válidos incluidos        = 46.373
VIN nulos/vacíos excluidos   = 8
VIN formato inválido excluidos = 9
vehiculo_canonico filas      = 46.373
duplicados VIN               = 0
```

No se corrigen VIN inválidos por inferencia.

## PRODUCTO MASTER

FK física:

```text
version_id -> versiones_master_v01(version_id)
```

`version_id` es nullable. MASTER V0.1 admite cobertura histórica incompleta y no autoriza equivalencias inventadas.

Fuentes de evidencia para producto:

1. alias VERSION resuelto de `vehiculos_raw`;
2. si no existe, mismo VIN en `ventas_raw` / `notas_venta_raw` con alias VERSION resuelto;
3. todas las fuentes disponibles por VIN deben converger a una única `version_id`.

Si existen versiones MASTER contradictorias para el mismo VIN:

```text
version_id = NULL
producto_conflicto = true
producto_match_method = CONFLICTO_CROSS_SOURCE
```

Validación inicial:

```text
con version_id       = 5.781
sin version_id       = 40.592
conflictos producto  = 2
FK producto rotas    = 0
```

Conflictos explícitos:

```text
LGJE5EE02TM516173  vehiculos=E2 / notas=E1
LGJE5EE0XTM516180  vehiculos=E2 / ventas+notas=E1
```

Caso cross-source no conflictivo:

```text
LGJE5EE01TM516309 -> version_id 7175 por notas_venta_raw
```

No se fuerza equivalencia para `MAGE 1.5T E2 DC` sin alias MASTER demostrado.

## ESTADO OPERACIONAL

Los campos operacionales se toman exclusivamente desde `vehiculos_raw`; `ventas_raw` y `notas_venta_raw` NO pisan estado, NV, factura, bodega ni hitos del vehículo en V0.1.

Campos persistidos:

- `nro_stock`;
- `marca_raw`, `modelo_raw`, `patente`, `ano_raw`, `color_raw`;
- `etapa`;
- `bodega_fuente`;
- `vigente`;
- `fecha_ingreso_stock`;
- `fecha_eta`;
- `fecha_nv`, `nota_de_venta`;
- `factura_tipo`, `numero_factura`, `fecha_factura`;
- `fecha_entrega_planificada`, `pendiente_entrega`;
- `esta_fisico_raw`, `esta_reservado`, `esta_en_transito`, `en_patio`;
- `tipo_ficha`;
- trazabilidad `source_table`, `source_vin_raw`, `canonicalized_at`.

`esta_fisico` se conserva como RAW porque su dominio observado es `A` / `X` / NULL y no existe contrato semántico demostrado para convertirlo a booleano.

## COBERTURA OPERACIONAL

Sobre 46.373 vehículos:

```text
bodega_fuente              46.373
fecha_ingreso_stock        46.169
fecha_eta                  46.226
nota_de_venta              43.788
fecha_nv                   43.788
numero_factura             43.239
fecha_factura              43.239
fecha_entrega_planificada  42.214
pendiente_entrega          43.269
vigente=true                3.891
esta_reservado=true         1.592
esta_en_transito=true         202
en_patio=true              32.914
```

## PRECEDENCIA

```text
estado operacional actual -> vehiculos_raw
producto MASTER            -> evidencia MASTER resuelta y convergente por VIN
ventas_raw/notas_venta_raw -> solo evidencia adicional de producto en esta tabla
```

La reconciliación de trayectoria comercial pertenece a `fact_operacion`; la venta reconocida pertenece a `fact_venta`.

## INTEGRIDAD

Controles obligatorios satisfechos:

```text
1 fila por VIN            = OK
VIN duplicados            = 0
VIN inválidos persistidos = 0
FK producto rotas         = 0
lineage distinto RAW      = 0
RAW válido vs canónico    = 46.373 = 46.373
```

## REFRESH

`vehiculo_canonico` representa estado actual, no historia de snapshots.

El refresh debe:

1. reconstruir determinísticamente el conjunto vigente desde RAW;
2. actualizar por `vin` preservando `vehiculo_id`;
3. insertar VIN válidos nuevos;
4. eliminar del estado actual VIN ausentes del full snapshot fuente si el contrato de ingestión sigue siendo `FULL_SNAPSHOT_REPLACE`;
5. nunca modificar RAW ni MASTER.

SQL reproducible: `sql/vehiculo_canonico_v01.sql`.

## GAPS ABIERTOS

- 40.592 VIN sin `version_id` por falta de equivalencia MASTER demostrada; no es blocker de grain ni integridad.
- 2 conflictos E1/E2 explícitos sin FK producto.
- 9 identificadores fuente con formato VIN inválido permanecen fuera del universo canónico hasta existir evidencia determinista de corrección.

No se implementó `fact_operacion`, `fact_venta`, métricas ni cubos.
