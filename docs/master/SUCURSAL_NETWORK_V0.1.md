# SUCURSAL_NETWORK_V0.1

## Objetivo

`sucursales_master` es la dimensión conformada de **puntos comerciales** de la red Cidef.

Debe permitir que hechos, métricas y motores usen una sola `sucursal_id` para analizar tiendas propias y puntos dealer, sin confundir la identidad física del punto con la identidad legal del dealer.

## Separación de identidades

```text
sucursal = punto físico/comercial
dealer = entidad legal
dealer_group = red comercial
```

Una sucursal dealer puede referenciar `dealer_id` cuando la entidad legal está determinada y `dealer_group_id` para la red comercial. No se fuerza un `dealer_id` cuando la fuente solo identifica la red.

## Fuentes vigentes

- `Sucursales DFM`, recibido 2026-08-28: catálogo actual de red Dongfeng.
- `respaldo.locales_master`: evidencia de bodega ↔ tienda propia, revalidada contra la red actual.
- `ventas_raw`: IDs ERP y aliases históricos.

## Contrato físico

Campos principales:

- `sucursal_id`: identidad técnica compartida.
- `sucursal_key`: clave estable de fuente/identidad.
- `id_sucursal_vta`: ID ERP cuando existe.
- `nombre_canonico`.
- `tipo_canal`: `CIDEF`, `DEALER`, `DEALER_AGREGADO` o `NO_COMERCIAL`.
- `dealer_id`: entidad legal, nullable.
- `dealer_group_id`: red dealer, nullable.
- `comuna`, `region`, `direccion`.
- `estatus`, `vigente`.
- `bodega_codigo`, `bodega_nombre`: aplicable a tiendas CIDEF cuando existe evidencia.
- `fuente`.

## Estado verificado 2026-08-28

- 61 identidades totales conservando historia ERP.
- 51 puntos comerciales vigentes:
  - 13 CIDEF;
  - 38 Dealer.
- 1 punto CIDEF futuro: Mall Cenco Florida.
- 7 identidades CIDEF históricas ERP no vigentes.
- 1 agrupador ERP histórico de concesionarios.
- 1 identidad ERP no comercial (`Vehiculos Restringidos`).

Las 13 tiendas CIDEF vigentes tienen correspondencia de bodega revalidada.

De los 38 puntos dealer vigentes:

- 37 tienen `dealer_group_id` resuelto;
- 35 tienen además `dealer_id` legal resuelto.

## Gaps explícitos

### Autos Ogaz

Macul y Bilbao se asignan al grupo `AUTOS OGAZ`, pero `dealer_id` queda NULL porque el grupo contiene dos entidades legales/RUT y el catálogo de sucursales no indica cuál opera cada punto. No se adivina la entidad legal.

### Megacenter Punta Arenas

El catálogo actual contiene `MEGACENTER`, pero esa identidad no existe todavía en el universo validado de `dealers_master`. El punto se conserva y queda conflicto pendiente de resolución dealer.

### Portillo Sur Osorno

La fuente rotula la sucursal de Osorno como `PORTILLO SUR Temuco`, pero comuna y dirección corresponden a Osorno. Se canoniza el punto como `PORTILLO SUR Osorno` y se registra la inconsistencia de fuente.

## Consumo analítico

`fact_venta` y otros hechos canónicos deben referenciar `sucursal_id` cuando exista evidencia suficiente.

Esto permite que los motores calculen por:

- punto de venta;
- tienda CIDEF;
- punto dealer;
- dealer legal;
- red dealer;
- comuna/región;
- vendedor/supervisor mediante relaciones de persona.

MASTER resuelve estas identidades. No contiene ventas, stock, desempeño, participación ni trayectoria analítica.
