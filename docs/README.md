# CIDEF Runtime Documentation

Este directorio documenta el runtime analítico y la arquitectura target vigente de CIDEF.

Su objetivo es permitir determinar:

> qué existe → por qué existe → qué hace → de qué depende → qué garantiza

## Jerarquía de autoridad

1. Código productivo y contratos ejecutables.
2. Schemas y contratos target.
3. Documentación `CURRENT` de `docs/`.
4. Documentación `REFERENCE`.
5. Documentación `HISTORICAL` / `LEGACY`.

## Arquitectura target del agente

Punto de entrada canónico:

[`target-protocol/README.md`](./target-protocol/README.md)

La arquitectura objetivo es el **Bounded Evidence Negotiation Protocol**:

```text
pregunta
→ grounding / QuestionContract
→ UniverseResolution
→ EvidenceGoal
→ Action semántica
→ ApplicabilityDecision
→ ExecutionAuthorization
→ motor determinista
→ TypedClaim / EvidenceRecord
→ EvidenceLedger
→ SufficiencyEvaluation
→ SynthesisPacket
```

El LLM selecciona semántica; el backend selecciona y autoriza ejecución física.

La migración actual prioriza instalar la cañería y conectar motores existentes. El perfeccionamiento analítico de los motores viene después.

## Mapa documental

### `target-protocol/` — CURRENT

Arquitectura canónica del nuevo protocolo del agente, sus fronteras, EvidenceGoals, conectividad y estrategia de migración.

### `architecture/` — CURRENT / REFERENCE

Universos analíticos y gobierno de autoridad de VENTAS, RVM, CRM y scope comercial. Siguen siendo autoridades upstream consumidas por el target.

### `master/` — CURRENT / REFERENCE

Identidad y organización estabilizada. MASTER define identidad; motores y agente no deben reconstruirla.

### `canonical/` — REFERENCE

Entidades y hechos canónicos usados como autoridad o entrada analítica.

### `database/` — CURRENT

Mapa físico de Neon, grains, claves, relaciones y clasificación de tablas.

### `runtime/`, `schemas/`, `capabilities/` — REFERENCE

Detalles de implementación y contratos específicos. No sustituyen la arquitectura target.

### `business-agent/` — HISTORICAL

Antecedentes de negocio útiles que todavía puedan conservar valor conceptual. La arquitectura legacy DECIDE/EXECUTE y sus question-family bundles ya no son autoridad y su documentación obsoleta debe eliminarse, no mantenerse como una segunda arquitectura aparente.

### `internal/`, `analytics/`, `ventas/` — LEGACY / HISTORICAL / OUT_OF_RUNTIME_SCOPE

Material de etapas anteriores o de construcción de datos. No define el protocolo target.

## Principios vigentes

### Determinismo

Identidad, universos, cálculos, reconciliaciones, authority, applicability, evidencia y suficiencia que requieran garantías viven en backend.

### No reconstruction

Si una identidad, universo, relación o métrica tiene autoridad certificada, el agente no la reconstruye.

### Separación semántica/física

```text
QuestionContract / EvidenceGoal / Action
→ backend
→ CapabilityContract / ExecutionAuthorization
→ motor
```

El agente no selecciona motores físicos.

### Evidencia acotada

El raw payload del motor no se entrega directamente a síntesis. Debe proyectarse a `TypedClaim`, admitirse como `EvidenceRecord` y satisfacer las obligaciones del Goal.

### Fronteras

```text
COMPANY != OWN_STORES != DEALERS
PRELIMINARY != CONSOLIDATED
PUBLISHED_PRICE != REALIZED_TRANSACTION_PRICE
ASSOCIATION != CAUSALITY
ATTRIBUTION != CAUSALITY
```

## Estado de migración

Ya existe una vertical target completa desde grounding hasta SynthesisPacket y se han conectado parcialmente ventas, forecast, desempeño organizacional, riesgo y contribución al cambio.

La siguiente frontera de conectividad es RVM + Pricing. Los motores se mantienen semánticamente estables durante esta fase.

Después de suficiente conectividad vendrán persistence, `/api/protocol`, shadow/canary, conexión del agente y posterior afinamiento de motores.

## Regla documental

No mantener dos arquitecturas como si ambas fueran vigentes.

Cuando el target reemplace un contrato legacy, la documentación legacy debe eliminarse o quedar inequívocamente histórica sólo cuando conserve valor real de referencia.

Ante contradicción, prevalece el código ejecutable y los contratos target.