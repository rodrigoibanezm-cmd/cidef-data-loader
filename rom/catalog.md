# Catálogo de datos — CIDEF Motor Lab

Este catálogo describe la superficie de datos que el agente CIDEF puede explorar mediante `DISCOVERY` y sus capabilities declaradas en `rom/schema.json`.

Los únicos dominios analíticos canónicos son:

```text
VENTAS
RVM
CRM
```

`LONGITUDINAL` es un modo analítico temporal dentro de esos dominios; no es un cuarto dominio. `DISCOVERY` es una superficie auxiliar de exploración controlada; tampoco es un dominio analítico.

La allowlist real de `DISCOVERY` vive en backend. Si existe discrepancia, usar `DISCOVERY / LIST_TABLES` y tomar esa respuesta como autoridad operacional sobre las tablas explorables.

## RAW

- `vehiculos_raw`: evidencia operacional de vehículos.
- `ventas_raw`: evidencia de ventas reconocidas por la fuente.
- `notas_venta_raw`: evidencia de notas de venta y proceso comercial disponible.
- `rvm_raw`: inscripciones/matriculaciones de mercado.
- `CRM_Cidef_raw`: evidencia CRM disponible para demanda, gestión, conversión y estados comerciales.

RAW es evidencia fuente. No constituye identidad canónica ni autoriza reconstruir universos analíticos que ya estén certificados.

## MASTER V0.1 — Producto

- `marcas_master_v01`
- `modelos_master_v01`
- `generaciones_master_v01`
- `versiones_master_v01`
- `version_generation_v01`
- `generation_evidence_v01`
- `producto_aliases_v01`
- `producto_clasificacion_v01`
- `producto_portafolio_v01`

Jerarquía estructural objetivo:

```text
BRAND
→ MODEL
→ GENERATION
→ VERSION
```

`version_generation_v01` conserva el estado canónico de pertenencia VERSION→GENERATION (`RESOLVED`, `UNRESOLVED`, `CONFLICT`). `generation_evidence_v01` conserva evidencia fuente; no autoriza inferir generaciones por parecido textual.

## MASTER V0.1 — Sucursal

- `sucursales_master`
- `sucursal_aliases`

## MASTER V0.1 — Dealer

- `dealer_groups`
- `dealers_master`
- `dealer_aliases`
- `dealer_supervisor`

## MASTER V0.1 — Persona

- `personas_master`
- `persona_aliases`
- `persona_roles`
- `persona_sucursal`
- `persona_estado_comercial`

## MASTER transversal

- `master_conflicts`

## Universos analíticos certificados

Los motores de dominio pueden preparar universos analíticos certificados antes de ejecutar una familia determinista.

- VENTAS → `ventas_universe_v01`
- RVM → `rvm_universe_v01`
- CRM → `crm_universe_v01`

Estos universos son capas internas de preparación analítica. No son tablas RAW ni superficies que el agente deba reconstruir con `DISCOVERY`.

Regla arquitectónica:

```text
pregunta
→ dominio(s)
→ contexto directo al agente + universo certificado
→ familia determinista sobre el universo preparado
→ resultado al agente
```

Una familia no debe volver a consultar RAW o MASTER para reconstruir reconocimiento, identidad, pertenencia, canal, organización o universo ya resuelto por su universo certificado.

## Contexto CRM certificado

`CRM / CONTEXT` expone `crm_context_v01` para obtener el BIG_PICTURE descriptivo del CRM. Consume únicamente `crm_universe_v01` y entrega volumen, mix de demanda, estado comercial observable, distribución OWN_STORES y cobertura. `ASSIGNED_AT` es el reloj comercial por defecto; `CREATED_AT` se reserva para generación de demanda. No diagnostica ni recomienda.

## Reglas de uso

- RAW = evidencia, no identidad canónica.
- MASTER = autoridad de identidad estable compartida.
- Los universos certificados son la autoridad de preparación analítica para sus familias.
- No usar tablas legacy fuera de esta lista como autoridad.
- No asumir joins por parecido textual.
- Si una relación RAW→MASTER no está demostrada, debe permanecer explícitamente abierta.
- Antes de usar una columna desconocida, usar `DISCOVERY / TABLE_SCHEMA`.
- Para cardinalidad, nulos, extremos o valores frecuentes, usar `DISCOVERY / PROFILE_TABLE`.
- Para slices o agregados acotados sobre una tabla permitida, usar `DISCOVERY / QUERY_TABLE`.
- `DISCOVERY` se usa para explorar evidencia disponible o resolver preguntas de estructura/calidad cuando no existe una capability determinista apropiada.
- No usar `DISCOVERY` para reconstruir manualmente lógica, métricas, identidad, universos o cálculos que ya pertenezcan a una capability determinista disponible de VENTAS, RVM o CRM.
- No tratar `LONGITUDINAL` como dominio: cuando una pregunta requiere historia o evolución temporal, el análisis longitudinal se ejecuta dentro del dominio VENTAS, RVM o CRM correspondiente.
- `rom/schema.json` es la autoridad operacional sobre las Actions/capabilities públicas disponibles.
