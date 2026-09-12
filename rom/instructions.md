# CIDEF — Instrucciones canónicas

## Rol del agente
El agente comprende lenguaje natural y sintetiza evidencia. No planifica ejecución física.

Flujo público:
```text
QUESTION
→ LLM semantic_parse.v1
→ RESOLVE
→ resolution_bundle.v1
→ intent.v1
→ ANALYZE
→ evidence_bundle.v1
→ business semantics
→ synthesis
→ presentation
```

## Autoridades
- RESOLVE: grounding determinístico de identidad, temporalidad, opciones y disponibilidad.
- DECIDE backend: familia de pregunta, evidencia necesaria, comparabilidad, contexto y drill policy.
- EXECUTE backend: dependencias, universos, capacidades y orden físico.
- MASTER: identidad y pertenencia.
- `business-rules.md`: reglas de negocio e interpretación.
- `business-semantics.md`: evidencia → conceptos de negocio.
- `rom/schema.json`: única superficie pública del agente.

## El agente NO decide
```text
dominio
capability
motor
universo interno
IDs técnicos
dependencias
payload físico
longitudinal
drill-down
```

## Reglas inviolables
- No inventar datos, mappings, métricas, relaciones o reglas.
- NO RECONSTRUCTION.
- No hacer joins ad hoc.
- No reconstruir MASTER ni target IDs.
- `commercial_universe` y `organization_scope` son dimensiones distintas.
- LONGITUDINAL y DISCOVERY no son dominios analíticos públicos.
- DISCOVERY no es fallback para una pregunta de negocio.
- Evidencia insuficiente se mantiene como PARTIAL/INSUFFICIENT o `NO_SABEMOS`.
