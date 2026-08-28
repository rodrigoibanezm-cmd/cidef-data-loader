# MASTER_LAYER_V0.1

## Objetivo

Definir la primera capa MASTER construida sobre:

- `vehiculos_raw`
- `ventas_raw`
- `notas_venta_raw`

La capa MASTER resuelve identidad canónica y aliases. No reemplaza las RAW, no contiene hechos comerciales y no debe depender de interpretación LLM en tiempo de consulta.

## Principios

1. RAW conserva evidencia fuente.
2. MASTER resuelve identidad estable.
3. Los IDs MASTER deben persistir entre cargas diarias.
4. Una carga RAW nueva puede descubrir aliases o entidades nuevas, pero no debe renumerar identidades existentes.
5. No se fuerza una equivalencia ambigua.
6. Toda normalización debe ser determinística y auditable.
7. Los casos no resolubles automáticamente quedan pendientes de validación explícita.

---

# 1. Producto

La evidencia muestra tres niveles distintos:

- marca;
- nombre comercial;
- código técnico/SKU.

`vehiculos_raw.modelo`, `ventas_raw.articulo` y `notas_venta_raw.modelo` representan casi siempre el mismo código técnico.

`ventas_raw.desc_articulo` y `notas_venta_raw.modelo_comercial` representan el nombre comercial.

## `marcas_master`

**Propósito:** identidad canónica de marca.

**PK:** `marca_id`

Campos mínimos:

- `marca_id`
- `nombre_canonico`
- `activo`
- `created_at`
- `updated_at`

Fuente:

- `vehiculos_raw.marca`
- `ventas_raw.desc_mae_marca`
- `notas_venta_raw.desc_mae_marca`

Regla:

- normalizar espacios/case para comparar;
- preservar nombre canónico elegido;
- no eliminar una marca histórica porque desaparezca de un snapshot.

## `modelos_master`

**Propósito:** identidad del modelo comercial.

**PK:** `modelo_id`

**FK:** `marca_id`

Campos mínimos:

- `modelo_id`
- `marca_id`
- `nombre_canonico`
- `activo`
- `created_at`
- `updated_at`

Fuente principal:

- `ventas_raw.desc_articulo`
- `notas_venta_raw.modelo_comercial`

Regla:

- una misma etiqueta comercial puede agrupar varios SKU;
- el modelo comercial no identifica una versión de forma suficiente.

## `versiones_master`

**Propósito:** identidad técnica/SKU de producto.

**PK:** `version_id`

**FK:** `modelo_id`

Campos mínimos:

- `version_id`
- `modelo_id`
- `codigo_canonico`
- `descripcion_canonica`
- `activo`
- `created_at`
- `updated_at`

Fuente principal:

- `vehiculos_raw.modelo`
- `ventas_raw.articulo`
- `notas_venta_raw.modelo`

Regla:

- el SKU/código técnico es la identidad más fuerte disponible;
- asociación SKU → modelo comercial se construye con evidencia repetida y cruces por VIN;
- si un SKU aparece asociado a más de un modelo comercial incompatible, no resolver automáticamente.

## `producto_aliases`

**Propósito:** conservar equivalencias históricas y variantes entre fuentes sin destruir la identidad original.

**PK:** `producto_alias_id`

**FK posibles:** `marca_id`, `modelo_id`, `version_id`

Campos mínimos:

- `producto_alias_id`
- `nivel` (`marca`, `modelo`, `version`)
- `marca_id` nullable
- `modelo_id` nullable
- `version_id` nullable
- `fuente`
- `valor_raw`
- `valor_normalizado`
- `match_method`
- `confidence`
- `validated`
- `created_at`
- `updated_at`

Reglas automáticas fuertes:

- coincidencia exacta normalizada;
- SKU coincidente entre RAWs;
- asociación SKU/modelo comercial respaldada repetidamente por VIN.

Requieren validación:

- cambios históricos de código;
- renombres como `MAGE EV` ↔ `AEOLUS SKY 01 EV`;
- un modelo comercial asociado a múltiples variantes técnicas.

---

# 2. Sucursales

## `sucursales_master`

**Propósito:** identidad canónica de sucursal comercial.

**PK:** `sucursal_id`

Campos mínimos:

- `sucursal_id`
- `id_origen`
- `nombre_canonico`
- `activo`
- `created_at`
- `updated_at`

Fuente ancla:

- `ventas_raw.id_sucursal_vta`
- `ventas_raw.desc_sucursal_vta`

Fuentes auxiliares:

- `notas_venta_raw.desc_sucursal_vta`

Regla:

- `id_sucursal_vta` es la identidad fuente más fuerte disponible;
- normalizar whitespace y caracteres de control para comparar nombres;
- no inferir sucursal comercial desde `vehiculos_raw.bodega`.

`bodega` describe ubicación física/logística y pertenece a otro dominio.

## `sucursal_aliases`

Campos mínimos:

- `sucursal_alias_id`
- `sucursal_id`
- `fuente`
- `valor_raw`
- `valor_normalizado`
- `match_method`
- `validated`

Puede resolver automáticamente diferencias de formato como `Casa Matriz\r\r\n`.

Mappings bodega → sucursal deben quedar fuera hasta disponer de un catálogo formal o evidencia suficiente.

---

# 3. Dealers

## `dealers_master`

**Propósito:** identidad canónica del dealer real del canal indirecto.

**PK:** `dealer_id`

Campos mínimos:

- `dealer_id`
- `rut_normalizado`
- `razon_social_canonica`
- `nombre_comercial` nullable
- `activo`
- `created_at`
- `updated_at`

Identidad preferida:

`RUT normalizado > razón social normalizada > alias textual`.

Fuente principal:

- `notas_venta_raw.comentario`
- `notas_venta_raw.razon_social`
- `notas_venta_raw.cliente`

Patrón relevante:

`razon_social = FÓRUM DISTRIBUIDORA S.A.`
→ `comentario`
→ RUT + dealer real.

Este patrón es distinto de `entidad_financiera = FORUM`.

Regla determinística:

1. detectar contexto Forum Distribuidora;
2. extraer RUT del inicio/componente estructurado del comentario;
3. normalizar RUT;
4. asociar nombres observados al mismo RUT;
5. crear o reutilizar `dealer_id` estable.

## `dealer_aliases`

Campos mínimos:

- `dealer_alias_id`
- `dealer_id`
- `fuente`
- `valor_raw`
- `valor_normalizado`
- `tipo_alias`
- `match_method`
- `validated`

Ejemplos de aliases esperables:

- razón social con/sin punto;
- RUT con/sin dígito verificador o guion;
- tab/espacios;
- razón social + nombre comercial (`VALDEPEZ SPA // CARPOINT`).

No todo comentario debe interpretarse como dealer.

---

# 4. Personas

## `personas_master`

**Propósito:** identidad canónica de personas comerciales.

**PK:** `persona_id`

Campos mínimos:

- `persona_id`
- `nombre_canonico`
- `usuario_canonico` nullable
- `estado` nullable
- `created_at`
- `updated_at`

Fuentes disponibles:

- `ventas_raw.nombre_usuario`
- `notas_venta_raw.vendedor`
- `vehiculos_raw.vendedor`

Gap crítico:

`ventas_raw` y `notas_venta_raw` usan login/código; `vehiculos_raw` usa nombre completo. Las tres RAW no contienen una llave corporativa estable que permita unir ambos dominios con seguridad.

Por lo tanto, el master puede poblar inicialmente identidades de usuario observadas, pero la asociación login ↔ nombre completo debe venir de:

- catálogo corporativo;
- RRHH/usuarios ERP;
- validación manual explícita.

No usar `VIN compartido => misma persona`.

## `persona_aliases`

Campos mínimos:

- `persona_alias_id`
- `persona_id`
- `fuente`
- `valor_raw`
- `valor_normalizado`
- `tipo_alias` (`login`, `nombre`)
- `match_method`
- `confidence`
- `validated`

Los aliases ambiguos permanecen sin asignar.

---

# 5. Persistencia y refresco

La capa MASTER no debe reconstruirse mediante `DROP + CREATE` diario.

Flujo esperado después de cada refresh RAW:

1. leer valores observados;
2. normalizar solo para matching;
3. reutilizar IDs MASTER existentes;
4. insertar entidades nuevas únicamente cuando la identidad sea determinística;
5. insertar aliases nuevos;
6. marcar conflictos o casos ambiguos;
7. nunca renumerar entidades existentes;
8. nunca borrar identidad histórica por ausencia en el snapshot actual.

`activo` debe derivarse de una regla explícita del dominio, no simplemente de “aparece/no aparece hoy”.

---

# 6. Orden de implementación sugerido

Este documento no fija prioridad operativa. Técnicamente las unidades implementables son independientes:

- MASTER producto;
- MASTER sucursales;
- MASTER dealers;
- MASTER personas.

Dependencias internas:

`marcas_master` → `modelos_master` → `versiones_master` → `producto_aliases`.

`dealers_master` → `dealer_aliases`.

`sucursales_master` → `sucursal_aliases`.

`personas_master` → `persona_aliases`.

---

# 7. Gaps abiertos

1. Catálogo corporativo login ↔ nombre completo de personas.
2. Estado laboral activo/inactivo de vendedores.
3. Jerarquía comercial oficial modelo/versión de Cidef.
4. Validación de renombres históricos/cambios de SKU.
5. Catálogo formal bodega ↔ sucursal.
6. Dealer legal vs nombre comercial en aliases compuestos.
7. Dealers observados sin RUT suficientemente estructurado.

Estos gaps no bloquean el diseño de MASTER; bloquean únicamente resoluciones específicas que deben quedar explícitamente pendientes.
