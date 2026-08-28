# MASTER_LAYER_V0.1

## OBJETIVO

Definir contrato lógico de MASTER V0.1 sobre:

- `vehiculos_raw`;
- `ventas_raw`;
- `notas_venta_raw`.

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
9. Estado `activo` requiere regla de dominio explícita.

## 1. PRODUCTO

### JERARQUÍA

```text
marca
→ modelo comercial
→ versión / SKU técnico
```

### EVIDENCIA

**SKU técnico:**
- `vehiculos_raw.modelo`;
- `ventas_raw.articulo`;
- `notas_venta_raw.modelo`.

**Nombre comercial:**
- `ventas_raw.desc_articulo`;
- `notas_venta_raw.modelo_comercial`.

SKU/código técnico es la identidad más fuerte disponible para versión.

### `marcas_master`

**PK:** `marca_id`.

**IDENTIDAD:** nombre de marca normalizado.

**FUENTES:**
- `vehiculos_raw.marca`;
- `ventas_raw.desc_mae_marca`;
- `notas_venta_raw.desc_mae_marca`.

### `modelos_master`

**PK:** `modelo_id`.

**FK:** `marca_id`.

**IDENTIDAD:** modelo comercial dentro de marca.

Una etiqueta comercial puede agrupar múltiples SKU.

### `versiones_master`

**PK:** `version_id`.

**FK:** `modelo_id` cuando exista asociación resuelta.

**IDENTIDAD:** SKU/código técnico normalizado.

### `producto_aliases`

Conserva valores fuente y equivalencias observadas sin destruir identidad original.

DEBE registrar, según implementación:

- nivel;
- entidad MASTER;
- fuente;
- valor raw;
- valor normalizado;
- método de match;
- confianza/validación cuando corresponda.

### REGLAS

- Coincidencia exacta normalizada y SKU compartido entre RAW son evidencia fuerte.
- Asociación SKU → modelo comercial requiere evidencia compatible.
- SKU con asociaciones comerciales incompatibles → conflicto.
- Renombres históricos/cambios de código NO se resuelven por similitud semántica.
- SKUs distintos NO se fusionan solo porque compartan VIN histórico.

### EVIDENCIA DE IMPLEMENTACIÓN

Auditoría previa registrada:

- 241 SKU normalizados;
- 0 SKU con múltiples marcas observadas;
- 0 SKU con múltiples nombres comerciales observados;
- 22 SKU sin evidencia de nombre comercial.

## 2. SUCURSAL

### `sucursales_master`

**PK:** `sucursal_id`.

**ANCLA FUENTE:** `ventas_raw.id_sucursal_vta`.

**NOMBRE FUENTE:** `ventas_raw.desc_sucursal_vta`.

`notas_venta_raw.desc_sucursal_vta` puede resolverse SOLO contra nombre normalizado único ya anclado por ventas.

### `sucursal_aliases`

Conserva variantes fuente de nombres vinculadas a identidad canónica.

### REGLAS

- `id_sucursal_vta` es identidad fuente más fuerte disponible.
- Normalizar whitespace/caracteres de control para matching.
- `vehiculos_raw.bodega` NO identifica sucursal comercial.
- Mapping bodega → sucursal queda fuera hasta disponer de catálogo/evidencia formal.
- Nombre sin ID y sin match único → conflicto.

### EVIDENCIA DE IMPLEMENTACIÓN

- 22 IDs fuente auditados con un nombre normalizado cada uno.
- `Sucursal Chacabuco` observada sin ID fuente → conflicto explícito.

## 3. DEALER

### `dealers_master`

**PK:** `dealer_id`.

**IDENTIDAD PREFERIDA:** RUT normalizado.

Orden de fuerza:

```text
RUT validado
> cuerpo RUT observado estructuradamente
> razón social normalizada
> alias textual
```

### FUENTES

- evidencia dealer estructurada en RAW actuales;
- contexto `FÓRUM DISTRIBUIDORA S.A.` + comentario cuando cumpla regla determinista;
- catálogo histórico SOLO como seed si el RUT también está observado en RAW actual.

### REGLA FORUM DISTRIBUIDORA

1. detectar contexto Forum Distribuidora;
2. extraer RUT completo solo desde componente esperado del comentario;
3. validar dígito verificador;
4. si RUT corresponde a dealer observado, enriquecer identidad existente;
5. RUT válido pero desconocido → conflicto; NO crear dealer silenciosamente desde texto libre.

`entidad_financiera = FORUM` NO es regla de identidad dealer.

### `dealer_aliases`

Conserva razón social, nombre comercial y variantes textuales observadas.

Nombre compuesto como `VALDEPEZ SPA // CARPOINT` permanece alias; NO implica dos dealers.

### REGLAS

- No todo comentario representa dealer.
- Identidad histórica persiste.
- Evidencia ambigua → `master_conflicts`.

## 4. PERSONA

### `personas_master`

**PK:** `persona_id`.

**IDENTIDAD OBSERVADA PERSISTENTE V0.1:** login/código normalizado.

### FUENTES

**Login/código:**
- `ventas_raw.nombre_usuario`;
- `notas_venta_raw.vendedor`.

**Nombre completo:**
- `vehiculos_raw.vendedor`.

### MATCH LOGIN → NOMBRE V0.1

La implementación admite mapping determinista cuando existe igualdad simultánea entre `notas_venta_raw` y `vehiculos_raw` de:

```text
VIN
+
nota_de_venta
```

La coincidencia de VIN por sí sola NO es suficiente.

Para cada login:

- evidencia concordante única → mapping candidato;
- múltiples nombres incompatibles → conflicto;
- sin evidencia suficiente → login persiste sin nombre resuelto.

Confianza/validación depende de cantidad y consistencia de observaciones según contrato físico.

### EVIDENCIA DE IMPLEMENTACIÓN

Auditoría previa registrada:

- 237 logins;
- 235 mappings únicos login → nombre;
- 206 con al menos 5 observaciones concordantes;
- 29 con 1–4 observaciones;
- `DDROGUETT` y `FMALDONADO` sin nombre verificado.

Mappings débiles pueden conservarse con confianza explícita; NO deben marcarse validados sin cumplir threshold definido.

### `persona_aliases`

Conserva login/nombre observado + método de match + confianza/validación.

### NO INFERIR

- estado laboral activo/inactivo;
- rol actual;
- sucursal actual;
- equivalencia de personas por VIN compartido sin NV concordante.

Catálogo corporativo/RRHH sigue siendo fuente superior futura para validar identidad persona.

## 5. PERSISTENCIA Y REFRESH

MASTER NO se reconstruye mediante `DROP + CREATE` diario.

Flujo:

```text
leer evidencia RAW
→ normalizar para matching
→ reutilizar IDs existentes
→ insertar identidades nuevas deterministas
→ insertar/enriquecer aliases
→ registrar conflictos
→ preservar historia
```

### REGLAS

- NO `TRUNCATE` como estrategia de refresh.
- NO renumerar IDs.
- NO borrar identidad por ausencia temporal.
- Updates SOLO para evidencia nueva validada.
- `master_conflicts` es superficie común para casos pendientes.

## 6. DEPENDENCIAS INTERNAS

```text
marcas_master
→ modelos_master
→ versiones_master
→ producto_aliases

dealers_master → dealer_aliases
sucursales_master → sucursal_aliases
personas_master → persona_aliases
```

Las cuatro áreas MASTER pueden implementarse dentro de una misma caja operativa.

## 7. GAPS VIGENTES

- catálogo corporativo login ↔ persona;
- estado laboral activo/inactivo;
- jerarquía comercial oficial producto;
- validación de renombres/cambios históricos de SKU;
- catálogo formal bodega ↔ sucursal;
- resolución legal/comercial de aliases dealer compuestos;
- dealers sin RUT estructurado suficiente;
- `Sucursal Chacabuco` sin ID fuente;
- `DDROGUETT` y `FMALDONADO` sin nombre verificado.

## NO BLOQUEAN MASTER V0.1

Los gaps anteriores NO bloquean identidades deterministas ya resueltas.

DEBEN permanecer explícitos y NO completarse mediante inferencia LLM.
