# MASTER_LAYER_V0.1

## ESTADO

**CONTRATO EN REVISIÓN DE COBERTURA.**

Los principios de identidad de este documento siguen vigentes. Cada dominio debe reconciliarse contra todas las fuentes relevantes antes del cierre V0.1.

`respaldo` es índice de identidades candidatas. NO es autoridad. NO copiar tablas históricas como verdad.

## OBJETIVO

Definir contrato lógico de MASTER V0.1.

MASTER resuelve identidad canónica + aliases.

MASTER NO contiene hechos comerciales, stock, ventas, trayectoria operacional ni métricas.

Implementación física: `docs/master/MASTER_IMPLEMENTATION_V0.1.md`.

## PRINCIPIOS

1. RAW conserva evidencia fuente.
2. MASTER resuelve identidad estable.
3. IDs MASTER persisten entre refresh.
4. Nueva evidencia puede agregar entidades/aliases; NO renumera identidades existentes.
5. Equivalencias ambiguas NO se fuerzan.
6. Matching/normalización DEBE ser determinista y auditable.
7. Conflictos quedan explícitos para revisión.
8. Ausencia en snapshot actual NO elimina identidad histórica.
9. Estado activo/vigente requiere contrato temporal explícito; NO se deriva de existencia en MASTER.
10. Validación MASTER requiere cobertura + unicidad.
11. Una fuente relevante NO puede excluirse por conveniencia de implementación.

## 1. PRODUCTO

### CONTRATO

Producto se divide en seis piezas:

```text
IDENTIDAD
marcas_master
→ modelos_master
→ versiones_master

EVIDENCIA
producto_aliases

CLASIFICACIÓN
producto_clasificacion

RELACIÓN COMERCIAL TEMPORAL
producto_portafolio
```

Competencia NO pertenece a MASTER. Es una relación analítica recalculable por motores sobre hechos y métricas.

### 1.1 `marcas_master`

**GRAIN:** 1 fila por marca canónica.

Campos mínimos:

```text
marca_id
nombre_canonico
nombre_normalizado
created_at
updated_at
```

Reglas:

- marca persiste aunque deje de estar activa;
- `DFM` y `DFLM` son aliases de fuente de `DONGFENG` cuando la evidencia validada lo soporte;
- `ZNA` permanece identidad separada salvo evidencia determinista de equivalencia;
- NO almacenar `vigente`, `es_cidef`, `es_competencia` ni fuente única como atributos de identidad.

### 1.2 `modelos_master`

**GRAIN:** 1 modelo canónico dentro de una marca.

Campos mínimos:

```text
modelo_id
marca_id
nombre_canonico
nombre_normalizado
created_at
updated_at
```

Clave lógica:

```text
UNIQUE (marca_id, nombre_normalizado)
```

Reglas:

- nombre observado en RVM NO implica modelo canónico distinto;
- equivalencias de nomenclatura se resuelven mediante `producto_aliases`;
- modelo persiste aunque deje de comercializarse.

### 1.3 `versiones_master`

**GRAIN:** 1 versión canónica dentro de un modelo.

Campos mínimos:

```text
version_id
modelo_id
nombre_canonico
nombre_normalizado
created_at
updated_at
```

Clave lógica:

```text
UNIQUE (modelo_id, nombre_normalizado)
```

Reglas:

- NO usar unicidad global de `nombre_normalizado`;
- SKU/código técnico de una fuente es alias/evidencia cuando no constituye el nombre canónico;
- combustible, electrificación u otros atributos técnicos solo ingresan a clasificación cuando exista normalización certificada.

### 1.4 `producto_aliases`

**GRAIN:** 1 nomenclatura observada en una fuente asociada a identidad canónica.

Campos mínimos:

```text
alias_id
nivel
fuente
valor_raw
valor_normalizado
contexto_marca_raw
contexto_modelo_raw
marca_id
modelo_id
version_id
evidencia_tipo
evidencia_count
primera_observacion
ultima_observacion
estado
created_at
updated_at
```

`nivel`:

```text
MARCA | MODELO | VERSION
```

`estado`:

```text
RESUELTO | AMBIGUO | RECHAZADO
```

Reglas:

- alias se contextualiza por fuente + jerarquía observada; NO asumir unicidad global del texto;
- VIN exacto puede aportar evidencia de equivalencia;
- VIN individual permanece fuera de MASTER;
- fuzzy match NO resuelve identidad automáticamente;
- conflictos permanecen explícitos.

### 1.5 `producto_clasificacion`

**OBJETIVO:** almacenar taxonomías y atributos normalizados necesarios para comparación analítica sin convertirlos en identidad.

**GRAIN:** 1 clasificación vigente/observada de una identidad de producto bajo una taxonomía definida.

Debe soportar, según evidencia certificada:

```text
segmento
familia
tipo
combustible
electrificacion
otras taxonomias validadas
```

Campos conceptuales mínimos:

```text
clasificacion_id
marca_id
modelo_id
version_id
taxonomia
valor
fuente
valid_from
valid_to
estado
created_at
updated_at
```

Reglas:

- clasificación NO cambia identidad;
- clasificación de una fuente NO se transforma automáticamente en verdad canónica;
- competencia NO se almacena aquí;
- debe permitir que hechos/marts soporten cortes por segmento, familia, modelo u otras taxonomías certificadas.

### 1.6 `producto_portafolio`

**OBJETIVO:** relación comercial temporal entre producto y organización/portafolio.

**GRAIN:** 1 relación temporal de una identidad de producto con un portafolio.

Campos conceptuales mínimos:

```text
portafolio_id
marca_id
modelo_id
version_id
organizacion
valid_from
valid_to
vigente
fuente
documento_origen
created_at
updated_at
```

Reglas:

- V0.1 carga CIDEF; el contrato NO queda limitado estructuralmente a CIDEF;
- lista de precios vigente es autoridad para portafolio CIDEF actual;
- nueva lista cierra vigencia anterior y abre nueva relación cuando corresponda;
- ausencia de portafolio vigente NO elimina identidad MASTER;
- RVM NO define portafolio CIDEF.

### FUENTES Y AUTORIDAD

```text
RVM
→ universo de mercado
→ aliases/evidencia de mercado
→ actividad de mercado
→ NO autoridad de portafolio CIDEF

lista de precios vigente CIDEF
→ autoridad de portafolio CIDEF actual

vehiculos_raw / ventas_raw / notas_venta_raw
→ aliases CIDEF
→ evidencia histórica
→ matching

respaldo
→ candidatos/mappings históricos
→ NO autoridad
```

### ORDEN DE RESOLUCIÓN

```text
1. evidencia exacta por VIN
2. identidad explícita de fuente autoritativa del dominio
3. mapping determinista validado
4. alias textual contextualizado
5. evidencia insuficiente → AMBIGUO
```

Fuzzy match puede proponer candidatos. NO puede cerrar equivalencia.

### CASOS VALIDADOS

```text
DFM / DFLM
→ aliases de fuente de DONGFENG bajo mappings validados

MAGE EV
!= S50 EV

RVM S50 observado sobre VIN CIDEF MAGE EV
→ evidencia/alias histórico RVM
→ NO fusionar identidades

RICH 6
→ identidad CIDEF

RVM ZNA / NEW RICH
RVM DFM / DF6
→ aliases RVM de RICH 6 cuando el cruce VIN/version lo valide
```

### ALINEACIÓN ANALÍTICA

Las mismas `marca_id`, `modelo_id` y `version_id` deben poder ser referenciadas por:

```text
fact_venta
fact_operacion
vehiculo_canonico
fact_mercado
```

Esto permite que motores comparen CIDEF y mercado sin redefinir identidad.

`producto_clasificacion` entrega cortes comparables. `producto_portafolio` determina relación comercial temporal. Ninguna de ambas define competencia.

## 2. SUCURSAL / LOCAL

### EVIDENCIA ACTUAL CONOCIDA

- `ventas_raw.id_sucursal_vta`;
- `ventas_raw.desc_sucursal_vta`;
- `notas_venta_raw.desc_sucursal_vta`;
- catálogo corporativo vigente;
- evidencia histórica de local/bodega revalidada.

### REGLAS

- `sucursales_master` es dimensión conformada de puntos comerciales CIDEF + dealer;
- `sucursal` = punto físico/comercial;
- `dealer` = entidad legal;
- `dealer_group` = red comercial;
- `id_sucursal_vta` es ancla fuerte cuando existe;
- nombre normalizado puede actuar como alias, NO necesariamente como identidad suficiente;
- `bodega` NO se equipara automáticamente a sucursal comercial;
- mapping local/bodega ↔ sucursal requiere evidencia determinista.

## 3. DEALER

### IDENTIDAD

RUT normalizado es ancla fuerte cuando existe.

Orden de evidencia:

```text
RUT validado
> cuerpo RUT observado estructuradamente
> razón social/nombre canónico con evidencia RAW
> alias textual
```

### REGLAS

- `dealers_master` = 1 entidad legal/RUT;
- `dealer_groups` = red comercial;
- supervisor es relación temporal, NO atributo de identidad;
- RUT distintos NO se fusionan;
- `entidad_financiera = FORUM` NO identifica dealer por sí sola;
- no todo comentario representa dealer;
- toda exclusión de candidato histórico debe quedar explicada por evidencia.

## 4. PERSONA

### IDENTIDAD

Separar identidad persistente de rol, vigencia y asignación organizacional.

### FUENTES

- `ventas_raw.nombre_usuario`;
- `notas_venta_raw.vendedor`;
- `vehiculos_raw.vendedor`;
- nómina corporativa vigente;
- evidencia histórica revalidada.

### REGLAS

- login/código es evidencia operacional; NO equivale automáticamente a persona física;
- VIN + nota_de_venta simultáneos entre fuentes constituyen evidencia determinista para relacionar login con nombre observado;
- VIN solo NO basta;
- no inferir equivalencia por nombre similar;
- no inferir activo/inactivo desde ausencia de ventas;
- históricos permanecen en `personas_master`.

## 5. PERSISTENCIA Y REFRESH

MASTER NO se reconstruye mediante `DROP + CREATE` diario.

```text
leer fuentes relevantes
→ normalizar para matching
→ reconciliar contra identidad persistente
→ reutilizar IDs existentes
→ insertar identidades nuevas deterministas
→ insertar/enriquecer aliases
→ registrar conflictos
→ validar cobertura
→ preservar historia
```

### REGLAS

- NO `TRUNCATE` como estrategia de refresh;
- NO renumerar IDs;
- NO borrar identidad por ausencia temporal;
- updates SOLO para evidencia nueva validada;
- conflictos explícitos;
- validación detecta identidades fuente no cubiertas por MASTER.

## 6. MÉTODO DE CIERRE V0.1

Para cada dominio:

```text
MASTER histórica respaldo
→ identidades candidatas
→ búsqueda en fuentes actuales
→ regla/fuente de descubrimiento
→ comparación con main
→ contrato final
→ implementación
→ validación de cobertura
```

MASTER V0.1 NO se cierra hasta completar reconciliación de producto, sucursal, persona y dealer.

## NO HACER

- NO copiar tablas antiguas ciegamente.
- NO considerar `main` correcto porque SQL ejecutó sin error.
- NO validar solo duplicados.
- NO ocultar identidades sin mapping eliminándolas del universo.
- NO iniciar capa canónica sobre MASTER no validada.
- NO almacenar competencia como atributo estático de producto.
