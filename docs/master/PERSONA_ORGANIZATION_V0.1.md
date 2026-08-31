# PERSONA_ORGANIZATION_V0.1

## ESTADO

**PERSONA MASTER V0.1 APROBADA — 2026-08-31.**

Auditoría final en Neon `main`:

```text
blockers = 0
```

## PRINCIPIO

`personas_master` conserva identidad persistente.

Rol, vigencia comercial y asignación organizacional son relaciones separadas y temporales.

Ventas observadas NO determinan por sí solas rol organizacional.

## FUENTES

- RAW = evidencia de identidad e historia observada.
- nómina corporativa vigente = autoridad para vendedores y supervisores de tiendas vigentes.
- `dealer_supervisor` = autoridad para supervisores dealer vigentes.
- MASTER histórica = evidencia/candidatos; NO autoridad automática.

## TABLAS

```text
personas_master
persona_aliases
persona_roles
persona_sucursal
persona_estado_comercial
```

Relaciones externas relevantes:

```text
dealer_supervisor
sucursales_master
master_conflicts
```

## ROLES

```text
VENDEDOR_TIENDA
SUPERVISOR_TIENDA
SUPERVISOR_DEALER
```

## VALIDACIÓN FINAL

```text
personas_master                 = 237
personas validadas              = 212
personas no validadas           = 25
persona_aliases                 = 313
aliases validados               = 284
aliases no validados            = 29
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

Integridad:

```text
duplicados usuario_canonico              = 0
duplicados RUT no nulos                  = 0
duplicados email                         = 0
aliases validados multi-persona          = 0
aliases huérfanos                        = 0
FK rotas                                 = 0
personas no validadas con rol vigente    = 0
duplicados vigentes persona+rol          = 0
vendedores con múltiples sucursales      = 0
asignaciones vigentes sin rol vigente    = 0
asignaciones a sucursal no vigente       = 0
dealer_supervisor sin SUPERVISOR_DEALER  = 0
```

## JENIFFER / ANTOFAGASTA

### Identidad histórica demostrada

```text
persona_id = 133
usuario    = JVARGAS
nombre     = JENIFFER VARGAS
```

Alias completo:

```text
JENIFFER VARGAS -> JVARGAS
validated=true
match_method=vin_nv_exact_cross_source
confidence=1.000
```

Evidencia:

```text
VIN con JENIFFER VARGAS = 3
VIN asociados a JVARGAS  = 3/3
```

### Fila de nómina no demostrada

```text
alias JENIFFER
validated=false
match_method=roster_identity_unresolved
```

`JVARGAS`:

```text
rol vigente            = NO
sucursal vigente       = NO
vigente_fuerza_venta   = false
```

Conflicto:

```text
dominio       = persona
natural_key   = JENIFFER|ANTOFAGASTA
conflict_type = roster_identity_unresolved
status        = rejected
```

Regla:

```text
JENIFFER VARGAS histórica demostrada
!=
JENIFFER fila de nómina demostrada
```

## ANGÉLICA MORENO

Una sola identidad:

```text
usuario = AMORENO
nombre  = ANGELICA MARIA MORENO DE MATOS
RUT     = 27.520.856-6
email   = amoreno@cidef.cl
```

Asignación:

```text
Plaza Sur   = histórica hasta 2026-06-30
Plaza Norte = vigente
```

## KCABALLOS / VLEYTON

Los RUT recibidos en fuente son inválidos.

No se corrige DV por inferencia.

Estado canónico:

```text
KCABALLOS
rut_normalizado = NULL
rut_dv          = NULL

VLEYTON
rut_normalizado = NULL
rut_dv          = NULL
```

Las identidades permanecen válidas por evidencia organizacional/login/email.

Conflictos:

```text
persona_rut_invalid_source
status = rejected
```

Constraint físico:

```text
ck_personas_master_rut_valid
```

Todo RUT completo persistido debe satisfacer:

```text
master_rut_valid(rut_normalizado || rut_dv)
```

## MASTER_CONFLICTS PERSONA

Estado final:

```text
pending  = 2
rejected = 3
validated= 0
```

Pending:

```text
DDROGUETT
FMALDONADO
```

Ambos:

```text
validated=false
sin nombre verificado
sin rol
no vigentes comercialmente
```

No bloquean cierre.

Rejected:

```text
JENIFFER|ANTOFAGASTA -> roster_identity_unresolved
KCABALLOS             -> persona_rut_invalid_source
VLEYTON                -> persona_rut_invalid_source
```

## REGLAS FINALES

- Persona histórica NO se elimina por no pertenecer a fuerza vigente.
- Rol histórico NO se inventa por aparición en ventas.
- Login NO se asume persona física sin reconciliación suficiente.
- Nombre parecido NO resuelve identidad.
- Nómina vigente certifica rol/vigencia actual; NO agota universo histórico.
- RUT fuente inválido NO se corrige automáticamente.
- Conflicto explícito puede permanecer abierto/rejected si no produce identidad resuelta falsa.

## DECISIÓN

```text
PERSONA MASTER V0.1 = APROBADA
blockers = 0
```
