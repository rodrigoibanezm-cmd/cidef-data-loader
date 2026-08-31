# MASTER_IMPLEMENTATION_V0.1

## ESTADO

**MASTER V0.1 CERRADA / VALIDADA — 2026-08-31.**

Neon `main` fue auditado integralmente después del saneamiento final de PRODUCTO y PERSONA.

```text
producto = APROBADO
sucursal = APROBADO
dealer   = APROBADO
persona  = APROBADO

blockers conocidos = 0
```

La capa canónica puede usar MASTER V0.1 como identidad compartida.

Contrato lógico: `docs/master/MASTER_LAYER_V0.1.md`.

## INVENTARIO FÍSICO VIGENTE

### PRODUCTO

```text
marcas_master_v01
modelos_master_v01
versiones_master_v01
producto_aliases_v01
producto_clasificacion_v01
producto_portafolio_v01
```

Las tablas sin sufijo `_v01` son legacy y NO forman parte del contrato final de PRODUCTO V0.1.

### SUCURSAL

```text
sucursales_master
sucursal_aliases
```

### DEALER

```text
dealer_groups
dealers_master
dealer_aliases
dealer_supervisor
```

### PERSONA

```text
personas_master
persona_aliases
persona_roles
persona_sucursal
persona_estado_comercial
```

### TRANSVERSAL

```text
master_conflicts
```

## PRODUCTO — VALIDACIÓN FINAL

```text
marcas_master_v01                = 102
modelos_master_v01               = 779
versiones_master_v01             = 11546
producto_aliases_v01             = 1117
producto_clasificacion_v01       = 3235
producto_portafolio_v01 vigente  = 61
DONGFENG vigente                 = 23
FOTON vigente                    = 38
VERSION internos RESUELTO        = 50
mappings SKU→VERSION lógicos     = 17
```

Controles finales:

```text
duplicados jerárquicos                 = 0
huérfanos                              = 0
versiones extra en modelos vigentes    = 0
RESUELTO multi-destino                 = 0
alias internos a versión no vigente    = 0
métodos internos no autorizados        = 0
falsos merges EV/no-EV                 = 0
```

Métodos VERSION internos permitidos:

```text
SKU_VERSION_EXACTO
COMERCIAL_VERSION_EXACTO
COMERCIAL_RVM_MODELO_UNICO_VERSION_UNICA
VIN_EQUIVALENCIA_COMPLETA
```

Reglas cerradas:

```text
MAGE != MAGE EV
S50 != S50 EV
G7 != G7 EV
TM3 != MIDI != TM5
ZNA NO se fusiona globalmente
RICH 6 solo por evidencia contextual determinista
```

Cobertura histórica incompleta de SKU NO bloquea cierre. SKU no demostrables permanecen abiertos.

## SUCURSAL — VALIDACIÓN FINAL

```text
sucursales_master = 64
vigentes          = 54
CIDEF vigentes    = 13
DEALER vigentes   = 41
CIDEF futuro      = 1
sucursal_aliases  = 98
```

Controles:

```text
sucursal_key duplicado                   = 0
id_sucursal_vta duplicado                = 0
aliases huérfanos                        = 0
aliases no validados                     = 0
dealer/group incompatibles               = 0
FK rotas                                 = 0
```

Estado válido:

```text
dealer_group_id conocido + dealer_id = NULL
```

cuando falta evidencia jurídica suficiente.

Casos validados:

```text
MEGACENTER Punta Arenas -> dealer_group resuelto, dealer_id NULL
MELHUISH Las Condes     -> dealer_group resuelto, dealer_id NULL
ROSSELOT Guanaco        -> vigente
ROSSELOT Ossa           -> vigente
PORTILLO SUR Osorno     -> separado de Temuco
KLASSIK CAR Vitacura    -> normalizado
ROSSELOT Movicenter     -> normalizado
```

## DEALER — VALIDACIÓN FINAL

```text
dealer_groups      = 22
dealers_master     = 24
dealer_aliases     = 24
dealer_supervisor  = 19 vigentes
```

Controles:

```text
dealer_group duplicado                   = 0
RUT-body duplicado                       = 0
aliases conflictivos/huérfanos           = 0
dealer legal ↔ dealer_group incompatible = 0
```

Contrato:

```text
dealer_groups  = identidad comercial
dealers_master = identidad jurídica / RUT
```

MELHUISH, AUTOS OGAZ y COLON preservan entidades legales distintas.

MEGACENTER conserva identidad comercial sin inventar entidad jurídica.

## PERSONA — VALIDACIÓN FINAL

```text
personas_master                 = 237
personas validadas              = 212
personas no validadas           = 25
persona_aliases                 = 313
aliases validados               = 284
VENDEDOR_TIENDA vigentes        = 70
SUPERVISOR_TIENDA vigentes      = 7
SUPERVISOR_DEALER vigentes      = 2
fuerza de venta vigente         = 79
históricas/no vigentes          = 158
persona_sucursal vigentes       = 82
persona_sucursal históricas     = 1
RUT completos informados        = 75
RUT válidos                     = 75
RUT inválidos                   = 0
```

Integridad final:

```text
duplicados usuario_canonico              = 0
duplicados RUT no nulos                  = 0
duplicados email                         = 0
aliases validados multi-persona          = 0
FK rotas                                 = 0
personas no validadas con rol vigente    = 0
duplicados vigentes persona+rol          = 0
múltiples sucursales vigentes inválidas  = 0
asignaciones vigentes sin rol            = 0
dealer_supervisor sin rol correspondiente= 0
```

### JENIFFER

```text
JVARGAS / JENIFFER VARGAS
= identidad histórica validada por VIN/NV cross-source
= no vigente

alias JENIFFER VARGAS
= validated=true
= match_method=vin_nv_exact_cross_source

alias JENIFFER
= validated=false
= roster_identity_unresolved

JENIFFER|ANTOFAGASTA
= master_conflicts
= roster_identity_unresolved
= rejected
```

No existe rol, sucursal vigente ni fuerza comercial vigente derivada de la fila ambigua de nómina.

### KCABALLOS / VLEYTON

RUT fuente inválido NO se corrige por inferencia.

```text
rut_normalizado = NULL
rut_dv          = NULL
```

Conflicto explícito:

```text
persona_rut_invalid_source
status = rejected
```

Constraint vigente:

```text
ck_personas_master_rut_valid
```

impide persistir un RUT completo inválido.

## MASTER_CONFLICTS

Conflicto explícito NO equivale automáticamente a blocker.

Regla de cierre:

```text
ambiguo/no demostrable -> abierto o rejected explícito
identidad RESUELTA contradictoria -> blocker
```

Los pendientes remanentes no producen identidades resueltas falsas.

## PERSISTENCIA

MASTER conserva identidad histórica y reutiliza IDs.

Reglas:

```text
NO DROP/TRUNCATE como refresh normal
NO renumerar IDs
NO borrar identidad por ausencia temporal
agregar/reconciliar aliases por evidencia
conflictos explícitos
```

Los scripts de saneamiento de 2026-08-31 fueron operaciones excepcionales de cierre, no contrato de refresh periódico.

## DECISIÓN

```text
MASTER V0.1 = CERRADA
blockers conocidos = 0
siguiente capa = HECHOS CANÓNICOS
```

La dimensión tiempo NO fue requisito físico para cerrar esta caja de identidad. Su contrato físico se define en la capa dimensional/canónica cuando corresponda.
