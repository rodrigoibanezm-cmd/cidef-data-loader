# REFRESH_VEHICULO_CANONICO_V0.1

## Motor

`refresh_vehiculo_canonico_v01`

Superficie: `POST /api/router`, tenant `data_loader`.

No se expone por `/api/custom-gpt`: es un motor de mantenimiento de data, no una capacidad analítica del agente.

## Objetivo

Reconstruir `vehiculo_canonico` desde los FULL SNAPSHOT RAW actuales sin modificar RAW ni MASTER.

Grain:

```text
1 fila = 1 VIN válido actual observado en vehiculos_raw
```

La implementación conserva el contrato de `sql/vehiculo_canonico_v01.sql` y luego recalcula salida comercial mediante `lib/canonical/vehiculo-salida-v01.js`.

## Estrategia

`FULL_REBUILD_CURRENT_STATE`

1. preflight de VIN válidos y duplicados;
2. upsert por `vin`, preservando `vehiculo_id` existente;
3. inserción de VIN válidos nuevos;
4. eliminación de VIN que ya no existen en el FULL SNAPSHOT `vehiculos_raw`;
5. reconstrucción de producto MASTER con evidencia convergente entre `vehiculos_raw`, `ventas_raw` y `notas_venta_raw`;
6. recálculo determinístico de `vendido`, `canal_salida`, sucursal/dealer y método de resolución;
7. persistencia de `resolution_status`;
8. auditoría final RAW vs canónico e integridad de salida.

## Salida comercial

La operación comercial actual se busca con precedencia estricta:

```text
1. ventas_raw: VIN + numero_factura exactos
2. ventas_raw: VIN + fecha_factura exacta, sólo cuando no existe match por factura
3. notas_venta_raw: VIN + fecha_factura + factura compatible, sólo cuando ventas_raw no contiene la operación
4. sin evidencia convergente -> UNRESOLVED
```

Los fallbacks por fecha no interpretan ni corrigen números de factura defectuosos. Sólo identifican la misma operación mediante VIN y fecha y la salida se persiste únicamente cuando las filas candidatas convergen en una única sucursal/tipo de canal MASTER.

Esto cubre explícitamente dos defectos observados de fuente:

- `ventas_raw.nro_factura` puede venir truncado/negativo aunque VIN y fecha correspondan a la venta actual;
- ventas históricas 2020 presentes en `vehiculos_raw` y `notas_venta_raw` pueden no existir en el snapshot actual de `ventas_raw`.

Se mantienen además las reglas V0.1:

- `TIENDA_PROPIA` sólo con sucursal MASTER CIDEF explícita;
- dealer directo por comprador MASTER resuelto;
- Forum nunca es dealer final;
- Forum se resuelve por comentario de la misma operación/NV con precedencia RUT -> razón social -> nombre comercial;
- evidencia contradictoria o insuficiente no se fuerza.

`resolution_status`:

```text
RESOLVED
  vendido y destino individual resuelto de forma determinística

UNRESOLVED
  vendido, pero falta evidencia suficiente para resolver canal/destino individual

NOT_APPLICABLE
  VIN no vendido
```

Los `UNRESOLVED` no bloquean el refresh. Representan ausencia real de evidencia y deben quedar explícitos.

## Invariantes bloqueantes

El motor aborta si el preflight encuentra VIN válido duplicado en `vehiculos_raw`.

La auditoría final exige:

```text
VIN válidos RAW = filas vehiculo_canonico
VIN válidos faltantes = 0
VIN canónicos extra = 0
VIN inválidos persistidos = 0
TIENDA_PROPIA con sucursal inválida = 0
DEALER con sucursal persistida = 0
resolution_status inconsistente = 0
```

Conflictos de producto MASTER y destinos comerciales `UNRESOLVED` se reportan, pero no se inventan ni bloquean por sí solos.

## Invocación

Aplicar refresh:

```json
{
  "tenant": "data_loader",
  "motor": "refresh_vehiculo_canonico_v01"
}
```

Preflight sin escritura:

```json
{
  "tenant": "data_loader",
  "motor": "refresh_vehiculo_canonico_v01",
  "input": {
    "dry_run": true
  }
}
```

## Respuesta

El motor entrega:

- estado previo (`before`);
- filas upsert/delete del rebuild base (`base`);
- resumen del resolver de salida (`salida`), incluyendo conteos por método de match;
- auditoría final (`audit`).
