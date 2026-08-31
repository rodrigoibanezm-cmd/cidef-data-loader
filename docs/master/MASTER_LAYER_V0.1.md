# MASTER_LAYER_V0.1

## ESTADO

**MASTER V0.1 CERRADA / VALIDADA — 2026-08-31.**

Dominios cerrados:

```text
producto
sucursal
dealer
persona
```

`respaldo` = evidencia histórica / índice de candidatos. NO autoridad.

Implementación física: `docs/master/MASTER_IMPLEMENTATION_V0.1.md`.

## OBJETIVO

MASTER resuelve identidad estable compartida + aliases + relaciones organizacionales necesarias para referenciar esa identidad.

MASTER NO contiene:

```text
ventas
stock
hechos comerciales
trayectoria operacional
métricas
competencia como atributo estático
```

## PRINCIPIOS

1. RAW conserva evidencia fuente.
2. MASTER resuelve identidad estable.
3. IDs MASTER persisten entre refresh.
4. Nueva evidencia puede agregar identidad/alias; NO renumera identidad existente.
5. Equivalencia ambigua NO se fuerza.
6. Matching debe ser determinista y auditable.
7. Conflictos quedan explícitos.
8. Ausencia actual NO elimina identidad histórica.
9. Vigencia requiere contrato temporal explícito.
10. Cobertura se audita, pero cobertura histórica incompleta NO obliga a inventar equivalencias.
11. Identidad RESUELTA contradictoria es blocker.
12. Pendiente no demostrable puede permanecer abierto/rejected sin bloquear.

# 1. PRODUCTO

## CONTRATO FÍSICO V0.1

```text
IDENTIDAD
marcas_master_v01
→ modelos_master_v01
→ versiones_master_v01

EVIDENCIA
producto_aliases_v01

CLASIFICACIÓN
producto_clasificacion_v01

PORTAFOLIO TEMPORAL
producto_portafolio_v01
```

Las tablas producto sin sufijo `_v01` son legacy y NO forman parte del contrato final.

## GRAIN

```text
marcas_master_v01
1 fila = 1 marca canónica

modelos_master_v01
1 fila = 1 modelo canónico dentro de una marca

versiones_master_v01
1 fila = 1 versión canónica dentro de un modelo

producto_aliases_v01
1 fila = 1 nomenclatura observada contextualizada a identidad
```

## REGLAS

- lista de precios vigente CIDEF = autoridad de portafolio CIDEF actual;
- RVM = universo/evidencia de mercado, NO autoridad de portafolio CIDEF;
- `DFM` / `DFLM` pueden ser aliases de DONGFENG cuando la evidencia validada lo soporte;
- ZNA permanece identidad separada salvo equivalencia contextual determinista;
- SKU técnico puede ser alias/evidencia; NO se fuerza a VERSION sin prueba;
- fuzzy/substring/majority NO cierran identidad;
- VIN individual aislado NO basta;
- cobertura histórica incompleta NO es blocker si lo no resuelto permanece explícito.

## VERSION INTERNA — MÉTODOS RESUELTOS PERMITIDOS

```text
SKU_VERSION_EXACTO
COMERCIAL_VERSION_EXACTO
COMERCIAL_RVM_MODELO_UNICO_VERSION_UNICA
VIN_EQUIVALENCIA_COMPLETA
```

## FRONTERAS DE IDENTIDAD

```text
MAGE != MAGE EV
S50 != S50 EV
G7 != G7 EV
TM3 != MIDI != TM5
```

RICH 6 solo converge desde RVM bajo evidencia contextual validada.

# 2. SUCURSAL

## CONTRATO

```text
dealer_group      = identidad comercial
dealers_master    = identidad jurídica / RUT
sucursales_master = punto físico/comercial
```

## GRAIN

```text
sucursales_master
1 fila = 1 punto físico/comercial identificable
```

## RELACIONES

```text
dealer_group 1:N dealers_master
dealer_group 1:N sucursales_master
```

NO asumir:

```text
sucursal 1:1 dealer legal
```

Estado válido:

```text
dealer_group_id = conocido
dealer_id       = NULL
```

cuando falta evidencia jurídica suficiente.

## REGLAS

- `id_sucursal_vta` es ancla fuerte cuando existe;
- nombre normalizado puede ser alias, no identidad suficiente por sí solo;
- bodega NO equivale automáticamente a sucursal;
- ausencia en red vigente NO elimina identidad histórica;
- alias conserva representación RAW;
- corrección de nombre canónico NO reescribe evidencia raw.

Contrato detallado: `docs/master/SUCURSAL_NETWORK_V0.1.md`.

# 3. DEALER

## IDENTIDAD

```text
dealer_groups
= identidad comercial

dealers_master
= identidad jurídica
= 1 fila por entidad legal / RUT
```

## ORDEN DE EVIDENCIA

```text
RUT validado
> cuerpo RUT estructurado
> razón social con evidencia RAW
> alias textual
```

## REGLAS

- RUT distintos NO se fusionan;
- múltiples entidades legales pueden pertenecer al mismo dealer_group;
- supervisor es relación temporal;
- `entidad_financiera=FORUM` NO identifica dealer;
- NO inventar entidad legal para completar jerarquía comercial.

Casos cerrados:

```text
MELHUISH -> múltiples entidades legales
AUTOS OGAZ -> múltiples entidades legales
COLON -> múltiples entidades legales
MEGACENTER -> dealer_group válido sin entidad jurídica demostrada
```

# 4. PERSONA

## CONTRATO

```text
personas_master
= identidad persistente

persona_aliases
= evidencia operacional / nombres / logins

persona_roles
= rol temporal

persona_sucursal
= asignación temporal

persona_estado_comercial
= pertenencia vigente a fuerza comercial
```

## ROLES SOPORTADOS

```text
VENDEDOR_TIENDA
SUPERVISOR_TIENDA
SUPERVISOR_DEALER
```

## REGLAS

- login NO equivale automáticamente a persona física;
- nombre parecido NO resuelve identidad;
- ventas NO determinan por sí solas rol organizacional;
- ausencia de ventas NO determina inactividad;
- históricos permanecen;
- VIN + evidencia cross-source puede resolver login↔nombre cuando la correspondencia sea determinista;
- RUT fuente inválido NO se corrige inventando DV;
- RUT inválido puede quedar como conflicto explícito, no como identificador canónico.

## CASOS CERRADOS

### JENIFFER

```text
JVARGAS ↔ JENIFFER VARGAS
= identidad histórica demostrada por VIN/NV cross-source

JENIFFER | Antofagasta
= fila de nómina no demostrada
= NO rol vigente
= NO sucursal vigente
= NO fuerza comercial vigente
= conflicto rejected
```

### KCABALLOS / VLEYTON

```text
RUT fuente inválido
→ rut_normalizado = NULL
→ rut_dv = NULL
→ persona_rut_invalid_source / rejected
```

Constraint:

```text
ck_personas_master_rut_valid
```

## FUENTES ORGANIZACIONALES

- nómina corporativa vigente = autoridad para vendedores/supervisores tienda vigentes;
- `dealer_supervisor` = autoridad para supervisores dealer vigentes;
- RAW = evidencia de identidad/historia, NO autoridad automática de rol.

Contrato detallado: `docs/master/PERSONA_ORGANIZATION_V0.1.md`.

# 5. MASTER_CONFLICTS

`master_conflicts` registra deuda o rechazo de reconciliación.

Estados:

```text
pending
validated
rejected
```

Regla:

```text
conflicto explícito no demostrado
!= blocker automático

identidad RESUELTA contradictoria
= blocker
```

# 6. PERSISTENCIA / REFRESH

MASTER NO se reconstruye mediante `DROP + CREATE` diario.

```text
leer fuentes
→ normalizar
→ reconciliar
→ reutilizar IDs
→ agregar identidades nuevas deterministas
→ agregar/enriquecer aliases
→ registrar conflictos
→ validar
→ preservar historia
```

Reglas:

- NO `TRUNCATE` como refresh normal;
- NO renumerar IDs;
- NO borrar identidad por ausencia temporal;
- updates solo con evidencia validada;
- saneamientos excepcionales no definen contrato de refresh periódico.

# 7. CIERRE V0.1

Validación integral final 2026-08-31:

```text
PRODUCTO = APROBADO
SUCURSAL = APROBADO
DEALER   = APROBADO
PERSONA  = APROBADO

blockers conocidos = 0
```

MASTER V0.1 puede ser consumida por la capa canónica.

La dimensión tiempo NO fue requisito físico de esta caja de identidad. Su contrato físico se define cuando corresponda en la capa dimensional/canónica posterior.

# NO HACER

- NO copiar `respaldo` ciegamente.
- NO asumir que SQL ejecutado = identidad correcta.
- NO cerrar equivalencias por fuzzy/substring/majority.
- NO ocultar identidad no resuelta eliminándola del universo.
- NO almacenar hechos o métricas en MASTER.
- NO redefinir persona/producto/sucursal/dealer dentro de hechos, marts o motores.
