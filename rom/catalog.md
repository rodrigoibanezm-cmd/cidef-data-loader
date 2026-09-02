# Catálogo de datos — CIDEF Motor Lab

Este catálogo describe la superficie de datos que el Custom GPT puede explorar mediante `/api/custom-gpt`.

La allowlist real vive en backend. Si existe discrepancia, ejecutar `list_tables` y tomar esa respuesta como autoridad operacional.

## RAW

- `vehiculos_raw`: evidencia operacional de vehículos.
- `ventas_raw`: evidencia de ventas reconocidas por la fuente.
- `notas_venta_raw`: evidencia de notas de venta y proceso comercial disponible.
- `rvm_raw`: inscripciones/matriculaciones de mercado.

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

## Reglas

- RAW = evidencia, no identidad canónica.
- MASTER = autoridad de identidad estable compartida.
- No usar tablas legacy fuera de esta lista como autoridad.
- No asumir joins por parecido textual.
- Si una relación RAW→MASTER no está demostrada, debe permanecer explícitamente abierta.
- Antes de usar una columna desconocida, consultar `table_schema`.
