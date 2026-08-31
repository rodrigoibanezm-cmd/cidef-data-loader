# SUCURSAL_NETWORK_V0.1

## CONTRATO

- `sucursales_master` = dimensión conformada de puntos físicos/comerciales.
- `sucursal` = punto físico/comercial identificable.
- `dealer` = entidad legal/RUT.
- `dealer_group` = identidad comercial del dealer.
- `dealer_group` 1:N `dealers_master`.
- `dealer_group` 1:N `sucursales_master`.
- NO asumir `sucursal` 1:1 entidad legal.
- Hechos canónicos referencian `sucursal_id` cuando exista identidad resuelta.
- MASTER NO contiene ventas, stock, desempeño, participación ni trayectoria.

## GRAIN

```text
sucursales_master
1 fila = 1 punto físico/comercial identificable

dealers_master
1 fila = 1 entidad legal / RUT

dealer_groups
1 fila = 1 identidad comercial de dealer
```

## TIPOS DE CANAL

Valores admitidos en `tipo_canal`:

- `CIDEF`
- `DEALER`
- `DEALER_AGREGADO`
- `NO_COMERCIAL`

## RELACIONES DEALER

- Punto `DEALER`: asignar `dealer_group_id` cuando la identidad comercial esté resuelta.
- Asignar `dealer_id` solo con evidencia suficiente de entidad legal.
- NO inferir `dealer_id` desde `dealer_group_id` cuando el grupo contiene múltiples RUT.
- `dealer_group_id` conocido + `dealer_id = NULL` es estado válido cuando falta evidencia jurídica suficiente.
- Múltiples `dealers_master` pueden pertenecer al mismo `dealer_group`.
- RUT distintos NO se fusionan aunque pertenezcan al mismo grupo comercial.

Casos validados:

```text
MELHUISH
├── AUTOMOTORA MELHUISH SPA
└── AUTOMOTORA MELHUISH RETAIL SPA

AUTOS OGAZ
├── AUTOMOTRIZ PEDRO ANDRES OGAZ SANTELICES E I R L
└── COMERCIALIZADORA OGAZ Y OGAZ SPA

COLON
├── COMERCIAL COLON LIMITADA
└── AUTOMECANICA COLON LIMITADA
```

## DEALER GROUPS — ESTADO VALIDADO 2026-08-31

```text
22 dealer_groups
```

Normalizaciones comerciales implementadas:

```text
AUTOMOTRIZ FOR CENTER -> FORCENTER
AUTOMOTRIZ PORTILLO SUR -> PORTILLO SUR
COMERCIAL COLON / AUTOMECANICA COLON -> COLON
AUTOMOTRIZ AUSTRAL -> AUSTRAL
AUTOMOTRIZ CARMONA -> CARMONA
COMERCIAL GRASS & ARUESTE -> GRASS Y ARUESTE
AUTOMOTRIZ ROSSELOT -> ROSSELOT
```

Preservar identidad histórica aunque no figure en red vigente.

Ejemplos:

- `CITY MOTOR`
- `AUTOMOTRIZ CORDILLERA`

## FUENTES

- catálogo corporativo vigente: autoridad de red comercial actual;
- RAW: aliases y evidencia de matching;
- evidencia histórica revalidada: preservación de identidad;
- `respaldo`: índice histórico/candidatos; NO autoridad.

## RED COMERCIAL VIGENTE — ESTADO VALIDADO 2026-08-31

Catálogo oficial:

```text
55 puntos
= 13 CIDEF vigentes
+ 41 DEALER vigentes
+ 1 CIDEF futuro
```

```text
54 puntos actualmente abiertos
+ 1 futuro
= 55 puntos del catálogo
```

Validado en Neon `main`:

```text
CIDEF vigentes  = 13
DEALER vigentes = 41
```

Identidades históricas permanecen con `vigente = false`.

## ALTAS INCORPORADAS

```text
MELHUISH Las Condes
ROSSELOT Guanaco
ROSSELOT Ossa
```

Estado:

```text
vigente = true
tipo_canal = DEALER
dealer_group_id resuelto
```

`MELHUISH Las Condes`:

```text
dealer_id = NULL
```

Causa: MELHUISH contiene múltiples entidades legales y no existe evidencia suficiente para asignar una entidad jurídica específica.

## MEGACENTER — PUNTA ARENAS

```text
dealer_group = MEGACENTER
sucursal = MEGACENTER Punta Arenas
dealer_id = NULL
```

No existe evidencia validada de RUT/razón social suficiente para crear o asignar una entidad jurídica.

Regla:

```text
NO inventar entidad legal para completar jerarquía.
```

## NORMALIZACIONES VALIDADAS

```text
KLASSIK CAR Vitacua
-> KLASSIK CAR Vitacura
```

```text
ROSSELOT Huechuraba
-> ROSSELOT Movicenter
```

```text
Hechuraba
-> Huechuraba
```

`PORTILLO SUR Osorno` mantiene identidad propia y `sucursal_key` corregida; Osorno y Temuco quedan diferenciados.

## SUCURSAL ALIASES — ESTADO VALIDADO 2026-08-31

```text
98 aliases
0 huérfanos
0 no validados
0 conflictos/duplicados por fuente + valor_normalizado
```

Altas con alias:

```text
MELHUISH Las Condes -> 1
ROSSELOT Guanaco    -> 1
ROSSELOT Ossa       -> 1
```

Contrato:

```text
RAW/source representation
-> alias
-> canonical identity
```

- Alias conserva el valor observado en la fuente.
- Corrección de nombre canónico NO reescribe automáticamente el alias raw.
- `alias_raw != nombre_canonico` es válido y esperado.

Ejemplos:

```text
alias raw: KLASSIK CAR Vitacua
-> canonical: KLASSIK CAR Vitacura

alias raw: ROSSELOT Huechuraba
-> canonical: ROSSELOT Movicenter
```

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
- Historia no se elimina por ausencia en red vigente.
- `vigente` representa vigencia del punto; no elimina identidad histórica.
- Alias de fuente se conservan en `sucursal_aliases`.
- NO inventar entidad jurídica para completar una jerarquía conocida parcialmente.
- Motores NO redefinen sucursal, dealer ni dealer group.
