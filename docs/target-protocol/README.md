# CIDEF Target Agent Protocol

Estado documental: `CURRENT`

Este directorio documenta la arquitectura objetivo que está reemplazando el runtime legacy de decisión/ejecución del agente CIDEF.

## Objetivo

Construir una cañería semántica y determinista que permita al agente descubrir qué evidencia existe, saber cuándo aplica, autorizar su ejecución y sintetizar únicamente evidencia admitida y suficiente.

La prioridad actual es **conectividad**, no perfeccionamiento de motores. Los motores analíticos existentes se mantienen semánticamente estables mientras se conectan al protocolo; su afinamiento vendrá después, cuando el agente tenga acceso y visibilidad suficientes para auditarlos.

## Arquitectura

```text
pregunta natural
→ grounding semántico
→ QuestionContract
→ UniverseResolution
→ EvidenceGoal / GoalInstance
→ Action semántica
→ ApplicabilityDecision
→ selección física backend-only
→ ExecutionAuthorization
→ motor determinista existente
→ projector específico
→ TypedClaim
→ EvidenceRecord
→ admisión determinista
→ EvidenceLedger
→ SufficiencyEvaluation
→ cierre backend-only
→ SynthesisPacket
```

El LLM selecciona dirección semántica. Nunca selecciona el motor físico.

## Objetos cerrados

El kernel objetivo está compuesto por:

1. `QuestionContract` — significado semántico de la pregunta.
2. `UniverseResolution` — identidad, pertenencia y autoridad resueltas determinísticamente.
3. `EvidenceGoal` / `GoalInstance` — proposición que debe demostrarse.
4. `CapabilityContract` — contrato de aplicabilidad y ejecución de una capacidad.
5. `ApplicabilityDecision` — determina si una capability puede satisfacer un Goal concreto.
6. `Action` — selección semántica ofrecida al agente; nunca contiene identidad física.
7. `ExecutionAuthorization` — autorización backend para una ejecución física exacta.
8. `TypedClaim` — proposición certificada proyectada desde el resultado físico.
9. `EvidenceRecord` — evidencia admitible con procedencia y autoridad.
10. `EvidenceLedger` — ledger append-only de evidencia admitida.
11. `SufficiencyEvaluation` — prueba backend-only de suficiencia.
12. `TypedSignal` — clasificación determinista derivada de evidencia admitida.
13. `TransitionRule` — navegación semántica determinista y acotada.
14. `ProtocolState` — estado versionado del protocolo.
15. `SynthesisPacket` — única superficie terminal autorizada para síntesis.

## EvidenceGoals cerrados

El vocabulario vigente contiene 14 objetivos:

- `OBSERVED_RESULT`
- `PROJECTED_RESULT`
- `EXPECTATION_GAP`
- `TEMPORAL_CHANGE`
- `TEMPORAL_TRAJECTORY`
- `RELATIVE_PERFORMANCE`
- `MARKET_POSITION`
- `RISK_STATUS`
- `CHANGE_ATTRIBUTION`
- `CONCENTRATION_STATUS`
- `SIGNAL_STATUS`
- `ASSOCIATED_MOVEMENT`
- `FLOW_STATUS`
- `OPERATIONAL_LEAKAGE`

No se agregan nuevos Goals para acomodar motores particulares. Si una proposición no cabe sin distorsión, se declara gap semántico.

## Fronteras fundamentales

### Semántica != ejecución física

```text
Action / Goal
    ↓
backend determina capability aplicable
    ↓
ExecutionAuthorization
    ↓
motor
```

El LLM no recibe ni selecciona `capability_id`, motor, SQL o request físico.

### Authority != availability

`UniverseResolution` establece identidad/autoridad. `AvailabilitySnapshot` establece si la evidencia puede intentarse con la cobertura disponible. La disponibilidad nunca crea relevancia semántica.

### Ejecución != evidencia

Un motor exitoso no entra automáticamente al ledger. Su output debe pasar por un projector específico, producir un `TypedClaim` autorizado y superar admisión determinista.

### Evidencia != suficiencia

`EvidenceAdmission` decide si una evidencia es válida. `SufficiencyEvaluation` decide si las obligaciones del Goal están demostradas. Sufficiency no calcula métricas.

### Evidencia != causalidad

Se preservan explícitamente:

```text
ASSOCIATION != CAUSALITY
ATTRIBUTION != CAUSALITY
PUBLISHED_PRICE != REALIZED_TRANSACTION_PRICE
PRELIMINARY != CONSOLIDATED
COMPANY != OWN_STORES != DEALERS
```

## Grounding

El grounding es semántico y acotado. Distingue:

- ambigüedad material que requiere aclaración;
- selección semántica diferida que puede resolverse mediante `Action`;
- ambigüedad de autoridad que corresponde a `UniverseResolution`.

El LLM puede interpretar lenguaje natural, pero no puede inventar aliases canónicos, universos, comparadores, causalidad ni scopes ausentes.

## Applicability

La decisión conceptual es:

```text
GoalInstance
× CapabilityContract
× UniverseResolution
× AvailabilitySnapshot
→ ApplicabilityDecision
```

Estados:

- `APPLICABLE`
- `NOT_APPLICABLE`
- `APPLICABLE_WITH_LIMITED_COVERAGE`

Cobertura limitada nunca puede alterar silenciosamente sujeto, universo, scope, comparación, grain o restricciones explícitas.

## Sufficiency y cierre

La prueba usa únicamente composición determinista de obligaciones (`ALL`, `ANY`, `OBLIGATION_REF`). No existe cálculo de negocio dentro de sufficiency.

Estados de Goal:

- `SATISFIED`
- `PENDING`
- `NOT_EVALUABLE`

El protocolo sólo puede cerrar `COMPLETE` cuando todos los Goals `REQUIRED` y `CONDITIONAL` activos están satisfechos, no existe conflicto crítico y no queda selección o ejecución bloqueante.

El cierre es backend-only.

## Navegación

La profundización futura se realiza mediante:

```text
EvidenceRecord admitido
→ TypedSignal determinista
→ TransitionRule
→ CandidateGoal
→ Action semántica
```

No existe exploración libre. La mera existencia de una capability nunca genera una transición.

El fixed point es monotónico, acotado y no ejecuta Actions ni motores por sí mismo.

## Estado de conectividad

La migración se realiza por vertical slices, reutilizando motores deterministas existentes.

Conectividad ya certificada parcialmente:

- ventas longitudinales: resultado observado, cambio y trayectoria;
- forecast de cierre mensual;
- desempeño organizacional relativo;
- deterioro/riesgo por regla existente;
- contribución al cambio por producto, tienda y vendedor.

Pendientes o parcialmente bloqueados incluyen:

- RVM / market authority y denominator;
- Pricing authority y vigencias;
- expectation gap compuesto;
- concentración completa;
- señales de negocio certificadas;
- asociación cross-source;
- flow/leakage CRM.

La etapa actual conecta RVM y Pricing a esta misma cañería sin modificar la semántica de sus motores.

## Pricing

Pricing debe ser una fuente analítica de primera clase dentro del target, manteniendo la diferencia entre condición comercial publicada y precio realizado.

La autoridad debe preservar, donde existan:

- identidad producto/versión;
- `price_version_id`;
- vigencia;
- precios publicados;
- `bono_cidef`;
- `bono_forum`;
- `bono_mes`;
- scope tienda/dealer sólo si la fuente lo representa;
- cobertura y procedencia.

El objetivo inmediato es exponer historia de condición comercial mediante claims acotados. No se implementa todavía elasticidad ni atribución precio→ventas.

La cañería debe dejar preparada una futura unión determinista:

```text
producto/versión canónico
+
fecha de evento comercial certificada dentro de vigencia de precio
```

Una pregunta futura como “¿cuántos VIN se explican por la baja de precio?” requerirá un motor de asociación/contrafactual certificado. No se inferirá causalidad a partir del simple cruce de ventas y vigencia.

## RVM

RVM debe preservar autoridad de sujeto, universo de mercado, denominator, período, geografía, grain, snapshot, cobertura y `data_status`.

`PRELIMINARY` y `CONSOLIDATED` son estados distintos y no intercambiables. Un projector o sufficiency nunca recalcula share o denominator: esos valores deben provenir como claims certificados del motor correspondiente.

## Principio de migración

```text
STRANGLER_VERTICAL_SLICES_WITH_SHADOW
```

El target se construye en paralelo al legacy. No se mezcla sufficiency legacy con target. El legacy permanece operativo hasta que persistence, endpoint target y shadow permitan un cutover controlado.

## Próximas fronteras

Después de completar conectividad suficiente de fuentes:

1. persistencia de `ProtocolState`;
2. endpoint interno `/api/protocol`;
3. conexión del agente;
4. shadow/canary contra el runtime actual;
5. uso del agente para auditar y afinar motores;
6. cutover y eliminación final del legacy cuando exista evidencia suficiente.

## Regla de mantenimiento

Este documento describe el target estabilizado ya implementado o explícitamente cerrado como contrato arquitectónico. Los gaps de motores se documentan como gaps; no se corrigen semánticamente desde la cañería.

Ante contradicción, prevalece el código target ejecutable y sus schemas/tests.