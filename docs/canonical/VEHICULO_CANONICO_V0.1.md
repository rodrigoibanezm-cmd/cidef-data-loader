# VEHICULO_CANONICO_V0.1

## ESTADO

**IMPLEMENTADO / VALIDADO / ENRIQUECIDO — 2026-08-31**

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

Reconciliación:

```text
vehiculos_raw filas            = 46.390
VIN válidos incluidos          = 46.373
VIN nulos/vacíos excluidos     = 8
VIN formato inválido excluidos = 9
vehiculo_canonico filas        = 46.373
duplicados VIN                 = 0
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

Validación:

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

No se fuerza equivalencia para `MAGE 1.5T E2 DC` sin alias MASTER demostrado.

## ESTADO OPERACIONAL

Los campos de estado actual se toman exclusivamente desde `vehiculos_raw`; `ventas_raw` y `notas_venta_raw` NO pisan estado, NV, factura, bodega ni hitos del vehículo.

Campos base persistidos:

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

## SALIDA COMERCIAL ACTUAL

V0.1 incorpora resolución determinista del canal/salida comercial actual mediante:

- `vendido`;
- `canal_salida`;
- `es_tienda_propia`;
- `sucursal_venta_id`;
- `dealer_id`;
- `dealer_group_id`;
- `dealer_resolution_method`.

### Regla de venta actual

`vendido = true` cuando el estado actual tiene `numero_factura` y `fecha_factura`.

Para resolver contexto comercial desde `ventas_raw`, la fila actual se vincula solo por:

```text
VIN + numero_factura actual
```

No se usa historial arbitrario del mismo VIN como fallback.

### Regla de canal

- sucursal MASTER `tipo_canal = CIDEF` -> `TIENDA_PROPIA`;
- dealer directo identificado en comprador actual -> `DEALER`;
- comprador actual Forum -> `DEALER`, resolviendo dealer real desde comentario de la misma operación/NV;
- `entidad_financiera = FORUM` por sí sola NO convierte la venta en dealer;
- una financiación Forum con comprador distinto solo se clasifica dealer si el comentario actual identifica determinísticamente un dealer MASTER.

### Forum

**FORUM nunca es `dealer_id` final.**

Cuando el comprador actual es `FÓRUM DISTRIBUIDORA S.A.`, el dealer real se resuelve desde `notas_venta_raw.comentario` de la misma operación/NV usando precedencia:

```text
RUT único
→ razón social única
→ nombre comercial único
```

Si no existe resolución única, `dealer_id = NULL` y `dealer_resolution_method = NO_RESUELTO`.

Si el dealer individual es ambiguo pero todos los candidatos pertenecen al mismo grupo, `dealer_group_id` puede persistirse de forma determinista.

### Conflicto directo vs comentario

Si comprador actual y comentario actual apuntan a dealers distintos:

```text
canal_salida = DEALER
dealer_id = NULL
dealer_resolution_method = NO_RESUELTO
```

No se aplica precedencia de negocio inventada.

## VALIDACIÓN FINAL DE SALIDA

Sobre 46.373 VIN:

```text
vendidos                    = 43.239
tienda_propia               = 25.432
dealer                      = 17.357
dealer_directo              = 13.730
dealer_via_forum            = 3.448
dealer_sin_resolver         = 179
conflictos_dealer           = 1
forum_comprador_actual      = 3.601
forum_financiado_no_comprador = 1.735
sucursal_venta_resuelta     = 25.432
dealer_id_resuelto          = 17.178
dealer_group_resuelto       = 17.179
integridad_tienda_fallida   = 0
integridad_dealer_fallida   = 0
```

La diferencia `dealer_group_resuelto = 17.179` vs `dealer_id_resuelto = 17.178` corresponde a un caso donde el dealer individual no es determinístico pero el grupo sí.

Dos VIN que aparecían como Forum en una auditoría preliminar fueron excluidos de `forum_comprador_actual` porque la fila Forum correspondía a otra factura histórica del mismo VIN. Se conserva la regla estricta de venta actual y no se fuerza el conteo histórico.

## COBERTURA OPERACIONAL BASE

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
contexto comercial actual  -> ventas_raw por VIN + factura actual
comentario dealer Forum    -> notas_venta_raw de misma operación/NV
```

La reconciliación de trayectoria comercial pertenece a `fact_operacion`; la venta reconocida pertenece a `fact_venta`.

## INTEGRIDAD

Controles obligatorios satisfechos:

```text
1 fila por VIN                  = OK
VIN duplicados                  = 0
VIN inválidos persistidos       = 0
FK producto rotas               = 0
RAW válido vs canónico          = 46.373 = 46.373
tienda con sucursal inválida    = 0
dealer con sucursal persistida  = 0
```

## REFRESH

`vehiculo_canonico` representa estado actual, no historia de snapshots.

El refresh debe:

1. reconstruir determinísticamente el conjunto vigente desde RAW;
2. actualizar por `vin` preservando `vehiculo_id`;
3. insertar VIN válidos nuevos;
4. eliminar del estado actual VIN ausentes del full snapshot fuente si el contrato de ingestión sigue siendo `FULL_SNAPSHOT_REPLACE`;
5. recalcular salida comercial actual usando exclusivamente claves de operación/factura actuales;
6. nunca modificar RAW ni MASTER.

SQL base reproducible: `sql/vehiculo_canonico_v01.sql`.
Resolver de salida: `lib/canonical/vehiculo-salida-v01.js`.

## GAPS ABIERTOS

- 40.592 VIN sin `version_id` por falta de equivalencia MASTER demostrada; no bloquea grain ni integridad.
- 2 conflictos E1/E2 explícitos sin FK producto.
- 9 identificadores fuente con formato VIN inválido permanecen fuera del universo canónico.
- 179 salidas dealer sin `dealer_id` determinístico; se conservan como `NO_RESUELTO` y no se infieren.

`vehiculo_canonico` queda cerrado para V0.1. El siguiente hecho canónico a implementar es `fact_operacion`.
