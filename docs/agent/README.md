# CIDEF Agent — Runtime Architecture

Estado documental: `CURRENT`

Este documento explica **cómo funciona hoy el agente CIDEF por dentro**.

No reemplaza `rom/`, no redefine sus reglas y no es un prompt operativo. `rom/` gobierna el comportamiento del agente; este documento explica esa arquitectura para humanos y LLMs que necesiten comprender el sistema.

## 1. Propósito

El agente convierte una pregunta de negocio en una respuesta sustentada por evidencia analítica y cálculo determinista.

La arquitectura separa explícitamente:

- comprensión semántica de la pregunta;
- selección de dominio y capability;
- contexto para interpretación;
- universo certificado para cálculo;
- cálculo determinista;
- semántica de negocio;
- síntesis;
- presentación.

Flujo general:

```text
PREGUNTA
→ INTAKE / INTENCIÓN
→ DOMINIO(S)
→ PLAN MÍNIMO DE EVIDENCIA
→ por dominio:
   CONTEXTO ───────────────────────────────→ AGENTE
   UNIVERSO CERTIFICADO → FAMILIA/MOTOR ─→ RESULTADO → AGENTE
→ INTEGRACIÓN SEMÁNTICA
→ SÍNTESIS
→ PRESENTACIÓN
```

La separación entre `CONTEXTO` y `UNIVERSO CERTIFICADO` es una frontera arquitectónica central: son carriles distintos y cumplen responsabilidades distintas.

## 2. Qué hace el LLM y qué hace el backend

### LLM / agente

El agente puede:

- comprender la intención de la pregunta;
- elegir uno o varios dominios;
- seleccionar capabilities públicas;
- decidir qué evidencia mínima necesita;
- integrar evidencia compatible entre dominios;
- interpretar outputs deterministas;
- aplicar semántica de negocio;
- sintetizar y comunicar la respuesta.

### Backend determinista

El backend es responsable de aquello que requiere garantías reproducibles, incluyendo:

- contratos de entrada;
- resolución de identidad cuando existe autoridad certificada;
- pertenencia a universos;
- reconocimiento de hechos;
- scopes;
- cálculos;
- métricas;
- reconciliaciones;
- validaciones;
- thresholds deterministas cuando existan;
- outputs estructurados.

### Frontera

El agente **no debe reconstruir** manualmente aquello que ya tiene autoridad en backend.

```text
NO:
agente → RAW → reconstruye identidad → reconstruye universo → calcula

SÍ:
agente → capability pública → backend resuelve autoridad certificada → resultado
```

Esta regla se denomina `NO RECONSTRUCTION`.

## 3. Intake: partir desde la pregunta

El agente no parte desde tablas ni nombres físicos de motores.

El intake transforma:

```text
pregunta
→ intención
→ dominio(s)
→ concepto(s) de negocio
→ evidencia mínima
→ capability(s)
```

La intención puede ser:

- **descriptiva**: requiere un hecho acotado;
- **analítica/evaluativa/diagnóstica**: requiere contexto, comparación, trayectoria o explicación;
- **acción/priorización**: requiere primero un diagnóstico sustentado y sólo después evaluar accionabilidad.

Cada llamada debe responder una necesidad concreta. El agente no llama capabilities simplemente porque están disponibles.

## 4. Dominios analíticos canónicos

La arquitectura reconoce tres dominios analíticos canónicos:

```text
VENTAS  → resultado y desempeño comercial CIDEF
RVM     → mercado, share, posición y contexto competitivo
CRM     → demanda, gestión y conversión observable
```

Una pregunta puede requerir uno o varios dominios.

Los nombres de transporte no redefinen este modelo conceptual. Por compatibilidad, la superficie pública usa namespaces como `SALES` y `MARKET`, que corresponden conceptualmente a VENTAS y RVM.

### Superficies que no son dominios analíticos canónicos

`DISCOVERY` es una superficie auxiliar para inspección controlada de evidencia y estructura.

`LONGITUDINAL` es un modo analítico temporal transversal a VENTAS, RVM y CRM; no constituye un cuarto dominio.

`PRICING` existe actualmente como superficie pública con `HISTORY`, pero no forma parte de los tres dominios analíticos canónicos definidos por la arquitectura ROM actual.

## 5. Superficie pública y routing

El agente selecciona:

```text
domain + capability
```

No selecciona nombres físicos de motores.

El backend resuelve:

```text
domain + capability
→ capability registry
→ action/motor físico
```

Namespaces registrados actualmente:

```text
SALES
MARKET
CRM
PRICING
DISCOVERY
LONGITUDINAL
```

La autoridad ejecutable del mapping es:

```text
lib/custom-gpt/capabilityRegistry.js
```

La autoridad del contrato público visible al agente es:

```text
rom/schema.json
```

Los endpoints y nombres de transporte son una interfaz; no deben confundirse con la ontología conceptual del agente.

## 6. Contexto y universo certificado

### Contexto

El contexto existe para que el agente interprete correctamente la evidencia.

Puede aportar, según el dominio y la pregunta:

- estado general;
- trayectoria;
- comparación;
- distribución;
- posición;
- señales relevantes para interpretar el resultado.

El contexto se entrega al agente.

### Universo certificado

El universo certificado existe para delimitar **sobre qué evidencia está autorizado a calcular un motor**.

Contiene o deriva evidencia preparada bajo autoridades de identidad, reconocimiento, pertenencia, scope y tiempo.

La familia o motor determinista calcula sobre ese universo.

### Invariante

```text
CONTEXTO → AGENTE

UNIVERSO CERTIFICADO
→ FAMILIA / MOTOR
→ RESULTADO
→ AGENTE
```

El `CONTEXTO` **no entra al cálculo de la familia**.

La familia **no reconstruye** RAW, MASTER, identidad, pertenencia ni reconocimiento.

## 7. Scope antes de métrica

El scope forma parte de la pregunta analítica y debe fijarse antes de calcular.

En VENTAS existen universos comerciales certificados como:

```text
OWN_STORES
DEALERS
COMPANY
```

No se debe usar `COMPANY` como fallback implícito ni inferir el scope desde el grain solicitado.

En RVM, `organization_scope` es un concepto distinto de `commercial_universe` y debe respetar el contrato específico de la capability.

En CRM sólo pueden usarse los universos certificados por la capability correspondiente.

Un consumidor downstream puede restringir un universo cuando su contrato lo permite; no puede ampliarlo ni redefinir su semántica.

## 8. Familias y motores deterministas

Una capability pública encapsula una capacidad analítica acotada.

Su implementación física puede utilizar uno o más componentes internos, pero para el agente la frontera pública sigue siendo la capability.

El motor recibe evidencia preparada y produce un resultado estructurado que puede incluir:

- métricas;
- comparaciones;
- trayectoria;
- cobertura;
- reconciliaciones;
- validaciones;
- warnings;
- estados no evaluables.

El motor no debe convertir por sí solo una métrica en una conclusión de negocio que exceda su contrato.

Ejemplo:

```text
share ↓
```

es evidencia. No implica automáticamente:

```text
riesgo
red flag
causa
prioridad
```

## 9. Integración entre dominios

La integración entre dominios ocurre en el agente, no dentro de los motores de cada dominio.

```text
VENTAS result ─┐
RVM result ────┼→ AGENTE → integración semántica
CRM result ────┘
```

Para integrar evidencia deben ser compatibles:

- universo;
- período;
- corte temporal;
- grain;
- nivel de atribución;
- significado de las métricas.

No se construyen ratios o equivalencias cross-domain ad hoc sólo porque dos cifras estén disponibles.

Un período incompleto no equivale a un cierre. Una fuente no evaluable no demuestra ausencia. Cero observaciones sólo equivale a cero de negocio cuando la cobertura lo permite.

## 10. Semántica de negocio

Los motores producen evidencia. El agente transforma esa evidencia en conceptos de negocio usando reglas semánticas explícitas.

Flujo:

```text
evidencia determinista
→ referencia válida
→ brecha / trayectoria
→ concepto de negocio
→ síntesis / acción
```

Conceptos gobernados incluyen:

- brecha;
- deterioro;
- oportunidad;
- ventaja;
- fortaleza;
- riesgo;
- red flag;
- prioridad;
- señal;
- accionabilidad.

Una métrica aislada no autoriza una conclusión fuerte.

Ejemplos de límites:

```text
VIN ↓        ≠ deterioro
share ↓      ≠ red flag
mercado ↑    ≠ oportunidad
ventas ↑     ≠ ventaja
leads ↑      ≠ oportunidad capturable
conversión ↓ ≠ mala gestión
```

Cuando falta evidencia obligatoria, el agente debe bajar el nivel de conclusión a una formulación descriptiva, `señal`, `NO_EVALUABLE` o `NO_SABEMOS` según corresponda.

## 11. Profundización

Después de obtener contexto y evidencia inicial, el agente profundiza sólo cuando una nueva llamada puede:

- cambiar la conclusión;
- localizar el fenómeno;
- explicar una divergencia;
- descubrir heterogeneidad material;
- reducir incertidumbre relevante.

Una navegación típica puede ser:

```text
CIDEF
→ universo
→ tienda/dealer
→ marca
→ vendedor cuando aplique
→ producto/modelo
```

No existe obligación de recorrer todos los niveles.

El agente debe detenerse cuando ninguna capability disponible pueda cambiar materialmente la respuesta.

## 12. DISCOVERY

`DISCOVERY` se utiliza cuando falta evidencia estructural o una relación todavía no está encapsulada por una capability pública.

Secuencia disponible:

```text
LIST_TABLES
→ TABLE_SCHEMA
→ PROFILE_TABLE
→ QUERY_TABLE
```

No se usa por rutina.

DISCOVERY no autoriza al agente a reconstruir manualmente una capability que ya existe ni a reemplazar MASTER mediante normalización textual ad hoc.

## 13. LONGITUDINAL

La evolución temporal se activa cuando puede cambiar la interpretación de la pregunta.

`LONGITUDINAL` no es un dominio independiente. Es una capacidad temporal transversal sobre:

```text
VENTAS
RVM
CRM
```

No debe solicitarse automáticamente en toda pregunta analítica.

## 14. De evidencia a acción

Una tarea o recomendación no nace directamente de una métrica.

Debe existir:

```text
evidencia
→ concepto de negocio sustentado
→ ámbito controlable
→ acción proporcional a la certeza
```

El agente no inventa scores, pesos, thresholds o prioridades para completar una lista.

Si sólo existen tres focos sustentados, debe entregar tres aunque se hayan solicitado cinco.

## 15. Síntesis

Una vez cerrada la evidencia, la síntesis decide **qué comunicar**.

Para una lectura ejecutiva se prioriza:

1. conclusión que cambia la lectura;
2. magnitud y comparación que la sostienen;
3. divergencia frente a mercado, historia, expectativa o pares cuando sea pertinente;
4. riesgo, oportunidad o heterogeneidad material;
5. limitaciones sólo cuando cambian la interpretación.

La síntesis no reconstruye evidencia ausente ni elige silenciosamente entre resultados deterministas contradictorios.

## 16. Presentación

La presentación decide **cómo mostrar** la síntesis. No redefine la evidencia ni la interpretación.

En producción, el default es `BIG_PICTURE`: compacto, conclusivo y orientado a lectura humana.

`DEEP_DIVE` se utiliza cuando el usuario pide profundidad o cuando el BIG_PICTURE no basta para responder la intención.

En modo `DISCOVERY`, el output está optimizado para otro LLM: densidad, trazabilidad, reproducibilidad, decisiones, evidencia, excepciones y siguiente prueba.

Cambiar entre producción y discovery cambia la presentación, **no la lógica analítica ni los cálculos**.

## 17. Autoridades

La arquitectura se distribuye entre autoridades con responsabilidades distintas:

```text
Código productivo
  → comportamiento ejecutable

rom/schema.json
  → contrato público de capabilities e inputs

rom/intake.md
  → pregunta → intención → evidencia mínima

rom/orchestrator.md
  → secuencia de capabilities y coordinación de dominios

rom/business-rules.md
  → reglas de negocio, scopes y comparabilidad

rom/business-semantics.md
  → evidencia → conceptos de negocio

rom/synthesis.md
  → qué comunicar

rom/presentation.md
  → cómo presentar producción

rom/render.md
  → cómo presentar discovery a otro LLM

docs/
  → explicación documental del sistema
```

Si este documento contradice código productivo o un contrato operativo vigente de `rom/`, prevalece la autoridad ejecutable/operativa y este documento debe actualizarse.

## 18. Invariantes arquitectónicos

La arquitectura actual puede resumirse en estas reglas:

1. Las preguntas de negocio gobiernan la selección de evidencia.
2. El agente selecciona dominios y capabilities públicas, no motores físicos.
3. Los dominios analíticos canónicos son VENTAS, RVM y CRM.
4. DISCOVERY es auxiliar; LONGITUDINAL es temporal y transversal.
5. Contexto y universo certificado son carriles distintos.
6. El contexto no entra al cálculo de familias.
7. Las familias calculan sólo sobre universos preparados y certificados.
8. El agente y los motores downstream no reconstruyen autoridades upstream.
9. Scope se fija antes de grain y métrica.
10. Los motores producen evidencia; la semántica de negocio determina qué conclusión permite esa evidencia.
11. La integración cross-domain ocurre en el agente y exige compatibilidad explícita.
12. Síntesis y presentación no redefinen cálculos.
13. Ante evidencia insuficiente, se reduce la fuerza de la conclusión; no se completa mediante inferencia.
14. Cada llamada debe reducir incertidumbre, localizar el fenómeno o cambiar materialmente la lectura.
15. El agente se detiene cuando la evidencia disponible es suficiente o ninguna capability restante puede cambiar la conclusión.
