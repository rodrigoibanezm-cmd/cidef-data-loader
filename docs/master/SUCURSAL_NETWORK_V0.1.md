# SUCURSAL_NETWORK_V0.1

## CONTRATO

- `sucursales_master` = dimensión conformada de puntos comerciales.
- `sucursal` = punto físico/comercial.
- `dealer` = entidad legal.
- `dealer_group` = red comercial.
- Hechos canónicos referencian `sucursal_id` cuando exista identidad resuelta.
- MASTER NO contiene ventas, stock, desempeño, participación ni trayectoria.

## TIPOS DE CANAL

Valores admitidos en `tipo_canal`:

- `CIDEF`
- `DEALER`
- `DEALER_AGREGADO`
- `NO_COMERCIAL`

## RELACIONES DEALER

- Punto `DEALER`: asignar `dealer_group_id` cuando la red esté resuelta.
- Asignar `dealer_id` solo con evidencia suficiente de entidad legal.
- NO inferir `dealer_id` desde `dealer_group_id` cuando el grupo contiene múltiples RUT.
- `dealer_id` y `dealer_group_id` son nullable.

## FUENTES

Prioridad vigente:

1. `Sucursales DFM`, recibido 2026-08-28: red comercial actual.
2. `respaldo.locales_master`: evidencia histórica de bodega ↔ tienda CIDEF; requiere revalidación.
3. `ventas_raw`: `id_sucursal_vta`, nombres ERP y aliases históricos.

`respaldo` es solo lectura.

## CAMPOS

- `sucursal_id`: PK técnica.
- `sucursal_key`: clave estable de identidad/fuente.
- `id_sucursal_vta`: ID ERP nullable.
- `nombre_canonico`.
- `tipo_canal`.
- `dealer_id`: nullable.
- `dealer_group_id`: nullable.
- `comuna`.
- `region`.
- `direccion`.
- `estatus`.
- `vigente`.
- `bodega_codigo`: nullable.
- `bodega_nombre`: nullable.
- `fuente`.

## ESTADO VALIDADO — 2026-08-28

- identidades totales: 61
- puntos vigentes: 51
- CIDEF vigentes: 13
- DEALER vigentes: 38
- CIDEF futuro: 1 — Mall Cenco Florida
- CIDEF históricos ERP: 7
- DEALER_AGREGADO histórico ERP: 1
- NO_COMERCIAL histórico ERP: 1
- CIDEF vigentes con bodega: 13/13
- DEALER vigentes con `dealer_group_id`: 37/38
- DEALER vigentes con `dealer_id`: 35/38

## GAPS

### AUTOS OGAZ — MACUL / BILBAO

- `dealer_group_id`: resuelto a `AUTOS OGAZ`.
- `dealer_id`: NULL.
- causa: grupo con 2 entidades legales/RUT; fuente no identifica operador legal del punto.
- regla: NO inferir entidad legal.

### MEGACENTER — PUNTA ARENAS

- punto comercial: válido y vigente.
- `dealer_group_id`: NULL.
- `dealer_id`: NULL.
- causa: MEGACENTER no existe en universo validado de `dealers_master`/`dealer_groups`.
- conflicto: `dealer_not_resolved`, pendiente.

### PORTILLO SUR — OSORNO

- nombre canónico: `PORTILLO SUR Osorno`.
- comuna: Osorno.
- fuente contiene nombre `PORTILLO SUR Temuco`.
- regla aplicada: comuna + dirección identifican Osorno.
- conflicto: `source_branch_name_inconsistent`, pendiente.

## CONSUMO

Dimensiones soportadas desde `sucursal_id`:

- punto comercial
- canal
- tienda CIDEF
- punto dealer
- dealer legal
- dealer group
- comuna
- región
- persona mediante `persona_sucursal`

## REGLAS DE INTEGRIDAD

- Una identidad física/comercial corresponde a una `sucursal_id`.
- Historia ERP no se elimina por ausencia en red vigente.
- `vigente` representa vigencia del punto según fuente actual; no elimina identidad histórica.
- Alias de fuente se conservan en `sucursal_aliases`.
- Gaps de identidad se registran en `master_conflicts`.
- Motores NO redefinen sucursal, dealer ni dealer group.
