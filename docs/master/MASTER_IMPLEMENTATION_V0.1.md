# MASTER_IMPLEMENTATION_V0.1

## ESTADO

**MASTER V0.1 ABIERTA — DEALER + SUCURSAL SANEADOS Y VALIDADOS.**

Dealer y sucursal fueron revisados directamente contra Neon `main` y su estado actual se considera válido para identidad MASTER.

Producto permanece en revisión final. Persona requiere validación integral dentro del cierre MASTER.

La capa canónica NO debe considerarse habilitada hasta cerrar MASTER V0.1 completa.

## OBJETIVO

Documentar implementación física y estado validado de MASTER V0.1.

Contrato lógico: `docs/master/MASTER_LAYER_V0.1.md`.
Contrato dealer/sucursal: `docs/master/SUCURSAL_NETWORK_V0.1.md`.

## DEALER + SUCURSAL — ESTADO VALIDADO 2026-08-31

### Jerarquía

```text
dealer_groups
→ identidad comercial

dealers_master
→ identidad jurídica
→ 1 fila = 1 entidad legal / RUT

sucursales_master
→ identidad del punto físico/comercial
→ 1 fila = 1 punto identificable
```

Relaciones:

```text
dealer_group 1:N dealers_master
dealer_group 1:N sucursales_master
```

NO asumir:

```text
sucursal 1:1 dealer legal
```

Estado válido ante evidencia jurídica insuficiente:

```text
dealer_group_id = conocido
dealer_id = NULL
```

### Dealer groups

```text
22 dealer_groups
```

Normalizaciones implementadas:

```text
AUTOMOTRIZ FOR CENTER -> FORCENTER
AUTOMOTRIZ PORTILLO SUR -> PORTILLO SUR
COMERCIAL COLON / AUTOMECANICA COLON -> COLON
AUTOMOTRIZ AUSTRAL -> AUSTRAL
AUTOMOTRIZ CARMONA -> CARMONA
COMERCIAL GRASS & ARUESTE -> GRASS Y ARUESTE
AUTOMOTRIZ ROSSELOT -> ROSSELOT
```

Identidad histórica se preserva aunque no figure en la red vigente.

### Red comercial vigente

Fuente oficial:

```text
55 puntos
= 13 CIDEF vigentes
+ 41 DEALER vigentes
+ 1 CIDEF futuro
```

Validado en Neon `main`:

```text
CIDEF vigentes  = 13
DEALER vigentes = 41
```

Históricos permanecen con `vigente = false`.

### Altas incorporadas

```text
MELHUISH Las Condes
ROSSELOT Guanaco
ROSSELOT Ossa
```

Todas:

```text
vigente = true
tipo_canal = DEALER
dealer_group_id resuelto
```

`MELHUISH Las Condes` mantiene `dealer_id = NULL` por ambigüedad jurídica entre entidades legales del grupo.

### MEGACENTER

```text
dealer_group = MEGACENTER
sucursal = MEGACENTER Punta Arenas
dealer_id = NULL
```

No existe evidencia validada suficiente para crear/asignar entidad legal.

### Normalizaciones sucursal

```text
KLASSIK CAR Vitacua -> KLASSIK CAR Vitacura
ROSSELOT Huechuraba -> ROSSELOT Movicenter
Hechuraba -> Huechuraba
```

`PORTILLO SUR Osorno`: `sucursal_key` corregida; Osorno y Temuco quedan diferenciados.

### Aliases sucursal

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
→ alias
→ canonical identity
```

Alias conserva evidencia de origen y NO se reescribe para igualar nombre canónico.

## REGLAS IMPLEMENTADAS / VALIDADAS

- MASTER resuelve identidad; NO hechos.
- RUT distintos NO se fusionan.
- `dealer_group` NO equivale a entidad legal.
- Múltiples razones sociales pueden pertenecer al mismo grupo comercial.
- NO inferir `dealer_id` solo porque `dealer_group_id` esté resuelto.
- NO inventar entidad legal para completar jerarquía.
- Identidad histórica NO se elimina por ausencia en red vigente.
- Alias raw y nombre canónico pueden diferir legítimamente.
- Validación requiere cobertura + unicidad + ausencia de conflictos no explicitados.

## SQL MASTER

1. `sql/010_master_schema.sql`
2. `sql/master/020_refresh_producto.sql`
3. `sql/master/021_refresh_sucursal_persona.sql`
4. `sql/master/022_refresh_dealer.sql`
5. `sql/master/023_validate_master.sql`

La existencia del SQL NO certifica por sí sola cierre de un dominio.

## ESTADO POR DOMINIO

```text
dealer   = SANEADO / VALIDADO
sucursal = SANEADO / VALIDADO
producto = REVISIÓN FINAL PENDIENTE
persona  = VALIDACIÓN INTEGRAL PENDIENTE DENTRO DEL CIERRE MASTER
```

## VALIDACIÓN FINAL REQUERIDA PARA CERRAR MASTER V0.1

- producto reconciliado y validado;
- persona incluida en validación integral final;
- cobertura reconciliada contra fuentes relevantes;
- claves naturales sin duplicados;
- aliases resueltos o explicitados;
- conflictos registrados;
- reglas de refresh aditivo verificadas;
- evidencia de población real en Neon `main`.

## BLOQUEO

MASTER V0.1 permanece abierta.

Dealer + sucursal NO son pendientes.

La capa canónica permanece bloqueada hasta cierre integral MASTER.
