# MASTER_LAYER_V0.1

## ESTADO

**CONTRATO EN REVISIÓN DE COBERTURA.**

Los principios de identidad de este documento siguen vigentes, pero el universo de fuentes/reglas usado para implementar MASTER resultó incompleto.

Antes de congelar V0.1 se debe reconciliar cada dominio contra todas las RAW relevantes y usar las MASTER históricas de branch `respaldo` como índice de identidades candidatas a revalidar contra RAW.

NO copiar `respaldo` como verdad. NO asumir que la implementación actual de `main` es exhaustiva.

Hallazgo confirmado 2026-08-28: `main.dealers_master` contiene 7 dealers mientras 23 de 24 dealers históricos de `respaldo.dealers_master` tienen evidencia directa por nombre normalizado en `inventario_vehiculos_global_raw.dealer_venta`.

## OBJETIVO

Definir contrato lógico de MASTER V0.1 sobre evidencia RAW disponible.

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
10. Validación MASTER requiere cobertura + unicidad; unicidad sola NO basta.
11. Una fuente RAW relevante NO puede excluirse por conveniencia de implementación.

## 1. PRODUCTO

### JERARQUÍA

```text
marca
→ modelo comercial
→ versión / SKU técnico
```

### EVIDENCIA ACTUAL CONOCIDA

**SKU técnico:**
- `vehiculos_raw.modelo`;
- `ventas_raw.articulo`;
- `notas_venta_raw.modelo`.

**Nombre comercial:**
- `ventas_raw.desc_articulo`;
- `notas_venta_raw.modelo_comercial`.

Estas fuentes NO se consideran todavía lista exhaustiva. La revisión debe contrastarlas con RAW históricas/vigentes relevantes y con identidades de producto observadas en `respaldo`.

### REGLAS

- SKU/código técnico es identidad fuerte cuando representa el mismo dominio de producto.
- Asociación SKU → modelo comercial requiere evidencia compatible.
- SKU con asociaciones comerciales incompatibles → conflicto.
- Renombres/cambios de código NO se resuelven por similitud semántica.
- SKUs distintos NO se fusionan solo porque compartan VIN histórico.
- La jerarquía final debe explicar identidades históricas omitidas o incorporarlas con evidencia.

## 2. SUCURSAL / LOCAL

### EVIDENCIA ACTUAL CONOCIDA

- `ventas_raw.id_sucursal_vta`;
- `ventas_raw.desc_sucursal_vta`;
- `notas_venta_raw.desc_sucursal_vta`;
- evidencia histórica de local/bodega a revalidar.

### REGLAS

- `id_sucursal_vta` es ancla fuerte cuando existe.
- Nombre normalizado puede actuar como alias, NO necesariamente como identidad suficiente.
- `bodega` NO debe equipararse automáticamente a sucursal comercial.
- Mapping local/bodega ↔ sucursal requiere evidencia determinista.
- La revisión debe explicar la diferencia entre las 22 sucursales actuales y el universo histórico de locales.

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

### FUENTES A REVISAR

La implementación NO puede limitarse a una sola ruta de detección.

Debe considerar al menos:

- campos dealer estructurados de inventario/vehículos;
- cliente/RUT cuando representa venta directa dealer;
- `dealer_venta` y campos derivados que puedan rastrearse a evidencia fuente;
- contexto Forum Distribuidora + comentario bajo regla determinista;
- MASTER histórica solo como índice para buscar evidencia nuevamente.

### HALLAZGO CONFIRMADO

`respaldo.dealers_master` contiene 24 dealers.

23 tienen evidencia directa por nombre normalizado en `inventario_vehiculos_global_raw.dealer_venta`.

`main.dealers_master` contiene 7.

Por lo tanto, la implementación actual NO tiene cobertura aceptable.

### REGLAS

- `entidad_financiera = FORUM` NO identifica dealer por sí sola.
- No todo comentario representa dealer.
- Nombre compuesto puede ser alias; NO implica automáticamente dos dealers.
- Toda exclusión de un dealer histórico debe quedar explicada por evidencia.

## 4. PERSONA

### IDENTIDAD

La definición final de identidad persona está bajo revisión.

Login/código es evidencia de identidad operacional, pero NO debe asumirse automáticamente equivalente a persona física sin reconciliación suficiente.

### FUENTES CONOCIDAS

- `ventas_raw.nombre_usuario`;
- `notas_venta_raw.vendedor`;
- `vehiculos_raw.vendedor`;
- nómina corporativa vigente cuando exista;
- evidencia histórica de `personas_master` para revalidación.

### MATCH OBSERVADO

VIN + `nota_de_venta` simultáneos entre fuentes constituye evidencia determinista para relacionar login con nombre observado.

VIN solo NO basta.

### REGLAS

- Separar identidad persistente de rol, vigencia y asignación organizacional.
- No inferir equivalencia de personas por nombre similar.
- No inferir activo/inactivo desde ausencia de ventas.
- La diferencia entre universo histórico de personas y logins actuales debe explicarse antes de congelar el contrato.

## 5. PERSISTENCIA Y REFRESH

MASTER NO se reconstruye mediante `DROP + CREATE` diario.

Flujo objetivo:

```text
leer todas las fuentes relevantes
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

- NO `TRUNCATE` como estrategia de refresh.
- NO renumerar IDs.
- NO borrar identidad por ausencia temporal.
- Updates SOLO para evidencia nueva validada.
- Conflictos deben quedar explícitos.
- Validación debe detectar identidades RAW no cubiertas por MASTER.

## 6. MÉTODO DE CIERRE V0.1

Para cada dominio:

```text
MASTER histórica respaldo
→ identidades candidatas
→ búsqueda en RAW
→ regla/fuente de descubrimiento
→ comparación con main
→ contrato final
→ implementación
→ validación de cobertura
```

MASTER V0.1 NO se cierra hasta completar esta reconciliación para producto, sucursal/local, persona y dealer.

## NO HACER

- NO copiar tablas antiguas ciegamente.
- NO considerar `main` correcto porque SQL ejecutó sin error.
- NO validar solo duplicados.
- NO ocultar identidades sin mapping eliminándolas del universo.
- NO iniciar capa canónica sobre MASTER no validada.
