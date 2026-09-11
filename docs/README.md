# CIDEF Runtime Documentation

Este directorio documenta el **runtime analítico actual** de CIDEF.

Su objetivo es permitir que una persona o un agente pueda determinar con claridad:

> qué existe → por qué existe → qué hace → de qué depende → qué garantiza

La documentación no es roadmap ni backlog. Describe únicamente contratos, arquitectura y conocimiento estabilizado.

## Frontera documental

Para efectos de esta documentación, las tablas consumidas por el runtime se consideran **entradas ya disponibles**.

Quedan fuera del recorrido documental principal:

- loaders e ingesta;
- parsing de archivos o fuentes;
- ETL y pipelines de carga;
- refresh/rebuild de tablas;
- migraciones de origen;
- diseños futuros o todavía no estabilizados.

La existencia de documentación histórica sobre esas materias no la convierte en autoridad del runtime actual.

## Jerarquía de autoridad

Cuando dos documentos parezcan contradecirse, usar este orden:

1. **Código productivo y contratos ejecutables** — autoridad sobre comportamiento implementado.
2. **`rom/schema.json`** — autoridad de la superficie pública expuesta al agente.
3. **Documentación `CURRENT` de `docs/`** — explicación canónica del sistema vigente.
4. **Documentación `REFERENCE`** — detalle útil de una capa o contrato específico.
5. **Documentación `HISTORICAL` / `LEGACY`** — antecedente de diseño; no define comportamiento actual.

`rom/` gobierna contratos operativos del agente. `docs/` los explica. No deben competir como autoridades duplicadas.

## Estados documentales

| Estado | Significado |
|---|---|
| `CURRENT` | Describe arquitectura o contrato vigente y puede usarse como documentación canónica. |
| `REFERENCE` | Describe una pieza real y útil, pero no debe interpretarse como mapa completo del runtime. |
| `HISTORICAL` | Conserva decisiones, investigación o diseño de una etapa anterior. |
| `LEGACY` | Describe una superficie o arquitectura reemplazada. |
| `OUT_OF_RUNTIME_SCOPE` | Puede seguir siendo técnicamente válido, pero pertenece a construcción/mantenimiento de datos u otra superficie fuera de esta documentación. |

## Mapa actual

### `architecture/` — CURRENT

Base canónica de arquitectura analítica.

Contiene los contratos de universo y gobierno que separan preparación de evidencia de cálculo analítico, incluyendo:

- universo analítico de VENTAS;
- universo analítico de RVM;
- universo analítico de CRM;
- gobierno de scope comercial;
- arquitectura analítica canónica y contratos relacionados.

Principio central:

```text
pregunta
→ dominio
→ contexto / universo certificado
→ capability / familia determinista
→ resultado estructurado
→ interpretación del agente
```

Una familia analítica no debe reconstruir RAW, identidad o pertenencia que corresponden a una autoridad upstream.

### `master/` — CURRENT / REFERENCE

Autoridad documental de identidad y organización estabilizada.

Incluye producto, sucursal/red, dealer y persona/organización. MASTER define identidad; los motores analíticos no deben redefinirla para simplificar un cálculo.

### `canonical/` — REFERENCE

Contratos de entidades/hechos canónicos que siguen siendo relevantes como entradas o autoridades del runtime.

`VEHICULO_CANONICO_V0.1.md` es referencia del vehículo canónico actual.

Documentos de refresh/rebuild pertenecen a mantenimiento de datos y se clasifican `OUT_OF_RUNTIME_SCOPE` para este recorrido documental.

### `database/` — CURRENT

Mapa físico vigente de la base Neon consumida por CIDEF.

Documenta:

- tablas existentes y su clasificación (`RAW`, `MASTER`, `CANONICAL`, `BRIDGE`, `ANALYTICAL`, `OPERATIONAL`, `STAGING`, `TEMP`, `LEGACY`);
- grain y claves físicas relevantes;
- relaciones PK/FK;
- autoridades y límites de reconstrucción;
- separación explícita entre tablas vigentes, legacy y auxiliares.

Punto de entrada: [`database/README.md`](./database/README.md).

### `runtime/` — REFERENCE

Documenta componentes runtime reales, especialmente piezas de VENTAS.

Estos documentos pueden describir capas internas anteriores a los universos certificados actuales. Son útiles para entender implementación y reglas específicas, pero **no sustituyen** los contratos vigentes de `architecture/` ni la superficie pública actual.

### `schemas/` — REFERENCE

Referencia física histórica/específica de algunas tablas y campos. Sirve para inspección y trazabilidad, no para definir por sí sola semántica analítica o contratos de negocio.

Para el mapa físico vigente completo, consultar `database/`.

### `business-agent/` — HISTORICAL

Conserva contratos y principios que guiaron la construcción inicial del agente: familias de preguntas, DEC, posición competitiva y red flags.

Parte de esos principios sigue vigente, pero estos documentos contienen supuestos y estados anteriores del sistema. No deben utilizarse como inventario de capabilities, fuentes disponibles ni arquitectura pública actual.

### `internal/` — LEGACY / HISTORICAL

Contiene inventarios y documentación de transición del router y de actions físicas.

En particular, documentos como `routing_inventory.md`, `routing_registry.md` y `motors.md` reflejan etapas anteriores de la superficie pública y **no son autoridad sobre el registry actual**.

Para routing vigente, consultar el código de `lib/custom-gpt/capabilityRegistry.js` y la superficie pública de `rom/schema.json`.

### `analytics/` — LEGACY / OUT_OF_RUNTIME_SCOPE

Agrupa motores, specs y superficies analíticas de otras etapas o perímetros.

No debe asumirse que un motor documentado aquí forma parte de la superficie pública actual del agente CIDEF.

### `ventas/` — HISTORICAL

Contexto de investigación y decisiones tempranas sobre ventas, forecast, dealers e inventario.

Es evidencia histórica de cómo se llegó a decisiones posteriores; no es contrato del runtime vigente.

## Superficie pública vigente

La selección pública sigue el patrón:

```text
domain + capability
→ registry backend
→ action/motor físico
```

El agente no debe seleccionar ni reconstruir libremente nombres físicos de motores.

Los dominios/superficies registrados actualmente en backend son:

- `SALES` — dominio conceptual VENTAS;
- `MARKET` — dominio conceptual RVM;
- `CRM`;
- `PRICING`;
- `DISCOVERY` — superficie auxiliar;
- `LONGITUDINAL` — modo analítico transversal.

Los dominios analíticos canónicos siguen siendo VENTAS, RVM y CRM. Los nombres de endpoints son superficies de transporte y no redefinen por sí mismos el modelo conceptual.

## Principios que deben preservarse

### Determinismo

El LLM interpreta intención y resultados. Las reglas de cálculo, reconciliación, identidad y pertenencia que requieren garantías viven en backend.

### No reconstruction

Si una identidad, universo, relación o métrica ya tiene autoridad certificada, el agente o un motor downstream no debe reconstruirla manualmente.

### Universos certificados

Las familias calculan sobre evidencia preparada. Pueden restringir un universo cuando su contrato lo permite; no pueden ampliarlo ni redefinir su semántica.

### Evidencia explícita

Los resultados deben preservar suficiente evidencia, cobertura, validaciones y warnings para distinguir hechos observados de inferencias o gaps.

### Separación de responsabilidades

```text
identidad
→ universo/contexto
→ cálculo determinista
→ JSON
→ semántica y síntesis LLM
```

La presentación no redefine el cálculo y el cálculo no redefine identidad.

## Regla de mantenimiento documental

Un documento nuevo debe indicar claramente si describe:

- arquitectura vigente;
- contrato de dominio;
- capability pública;
- contrato de datos/identidad;
- operación interna;
- antecedente histórico.

No documentar como definitivo aquello que todavía está en diseño.

Cuando una decisión estabilizada reemplace un documento anterior, actualizar este mapa o marcar explícitamente el documento reemplazado como histórico/legacy en lugar de permitir dos autoridades aparentes.
