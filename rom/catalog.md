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

## Cambio de ritmo de ventas

`SALES / PACE_CHANGE` expone `sales_pace_change_v01` V0.1 para los grains `COMPANY` y `STORE` dentro de `OWN_STORES`. Usa la serie intramensual certificada y cutoff-safe, deriva VIN por día comercial desde el acumulado y compara medianas multiescala sin thresholds, majority, quorum ni forecast. Una clasificación sólo existe cuando todas las ventanas candidatas son evaluables, robustas bajo leave-one-day-out y comparten exactamente el mismo signo.

`STABLE` significa exclusivamente ausencia determinista de cambio en el ritmo observado entre los tramos comparados. No significa buen desempeño, ritmo suficiente, salud comercial, cumplimiento, forecast favorable ni ausencia de riesgo. `NOT_EVALUABLE` rompe continuidad. En STORE, una fila sparse ausente nunca se interpreta automáticamente como cero.

`historical_equivalent_context` es únicamente evidencia descriptiva para el agente y nunca participa en la clasificación de `movement`.

## Brecha VIN certificada

`VENTAS / VIN_GAP` expone `vin_gap_v01` V0.1 para un único mes cerrado en el grain `OWN_STORES × STORE × BRAND × MONTH`. El VIN observado proviene de `ventas_universe_v01`; la referencia proviene de la familia certificada `expected_monthly_*`. Entrega solamente `reference_vin - observed_vin`: no implica oportunidad, capturabilidad, riesgo, deterioro, causalidad ni recomendación.

## Contrapartes competitivas de share

`MARKET / SHARE_TRANSFER` expone `competitive_share_transfer_v01` V0.1. Identifica movimientos inversos observados entre un sujeto y marcas/modelos dentro del mismo denominador RVM. El resultado es `CANDIDATE_COMPETITIVE_COUNTERPART`, nunca evidencia de VIN transferidos ni causalidad. `CHINESE_MARKET` usa exclusivamente `marcas_master_v01.origin_group='CHINESE'`; `MODEL_COMPARABLE_SET` es un `OBSERVED_RELATION_SET`, no equivalencia física o comercial plena.

En detalle y `CURRENT_MTD`, CIDEF es RAW DFM-only. Sólo `HISTORICAL + CIDEF_TOTAL` consume separadamente `brand_aggregate_organization_bucket`, derivado de reglas certificadas `BRAND_AGGREGATE` y su vigencia (DFM + ZNA cuando corresponde). ZNA no adquiere identidad de modelo DFM.

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
