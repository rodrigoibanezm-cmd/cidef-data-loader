# CIDEF Analytical Runtime

Runtime analítico determinista para el agente CIDEF.

Este README es el punto de entrada a la documentación del runtime. Describe cómo el agente consume capacidades analíticas sobre datos ya disponibles. La construcción, carga e ingesta de esas tablas queda fuera de esta frontera documental.

## Arquitectura

Los dominios analíticos canónicos son:

```text
VENTAS
RVM
CRM
```

El flujo vigente es:

```text
pregunta
→ dominio(s)
→ por dominio:
   contexto → agente
   universo certificado → familia determinista → resultado → agente
→ semántica de negocio
→ síntesis
→ presentación
```

El contexto y el universo son carriles distintos. El contexto ayuda al agente a interpretar; no entra al cálculo de la familia. Las familias calculan sobre universos previamente preparados y no reconstruyen RAW, MASTER, identidad, pertenencia ni reconocimiento.

## Responsabilidades

### Agente

El agente:

- comprende la pregunta;
- selecciona dominios y capabilities públicas;
- integra evidencia entre dominios;
- aplica reglas y semántica de negocio;
- sintetiza y presenta resultados.

El agente no redefine métricas, identidad, universos ni cálculos deterministas.

### Backend determinista

El backend:

- resuelve identidad y pertenencia;
- prepara universos analíticos certificados;
- ejecuta familias y motores deterministas;
- valida contratos, scopes e inputs;
- devuelve evidencia estructurada al agente.

Regla central: **NO RECONSTRUCTION**. Si una lógica pertenece al backend, el agente no debe reconstruirla manualmente.

## Universos certificados

Cada dominio principal tiene una capa interna de preparación analítica:

- VENTAS → `ventas_universe_v01`
- RVM → `rvm_universe_v01`
- CRM → `crm_universe_v01`

Estos universos son internos al runtime. No son capabilities públicas ni tablas que el agente deba reconstruir mediante DISCOVERY.

## Superficie pública

El agente trabaja con **dominios y capabilities públicas**, no con nombres físicos de motores.

Endpoints públicos por superficie:

```text
POST /api/custom-gpt/sales
POST /api/custom-gpt/market
POST /api/custom-gpt/crm
POST /api/custom-gpt/pricing
POST /api/custom-gpt/discovery
POST /api/custom-gpt/longitudinal
```

Cada endpoint acepta un contrato acotado de:

```text
capability + input
```

Los nombres de transporte no redefinen los dominios conceptuales:

- `SALES` expone capabilities de VENTAS.
- `MARKET` expone capabilities de RVM.
- `CRM` expone capabilities de CRM.
- `PRICING` es una superficie analítica especializada.
- `DISCOVERY` es una superficie auxiliar de exploración controlada; no es un dominio analítico.
- `LONGITUDINAL` es un modo temporal aplicable a VENTAS, RVM o CRM; no es un cuarto dominio analítico.

La autoridad operacional de contratos e inputs públicos es [`rom/schema.json`](./rom/schema.json).

## Capas del runtime

```text
Tablas disponibles
      ↓
MASTER / autoridades canónicas
      ↓
contextos + universos certificados
      ↓
familias / motores deterministas
      ↓
registry + router de capabilities
      ↓
API pública
      ↓
agente
      ↓
semántica + síntesis + presentación
```

El runtime contiene además componentes OLAP, capas canónicas, resolución de identidad, motores analíticos y validaciones compartidas. Su función es encapsular lógica determinista detrás de contratos públicos estables.

## Documentación canónica

### Operación del agente

- [Instrucciones canónicas](./rom/instructions.md)
- [Intake: pregunta → plan mínimo de evidencia](./rom/intake.md)
- [Orquestación analítica](./rom/orchestrator.md)
- [Reglas de negocio](./rom/business-rules.md)
- [Semántica analítica](./rom/business-semantics.md)
- [Síntesis](./rom/synthesis.md)
- [Presentación](./rom/presentation.md)
- [Render de discovery](./rom/render.md)
- [Composición de informes](./rom/report.md)
- [Catálogo de datos y autoridades](./rom/catalog.md)
- [Contrato OpenAPI público](./rom/schema.json)

### Arquitectura y autoridades analíticas

- [Arquitectura analítica canónica](./docs/architecture/CANONICAL_ANALYTICS_V0.1.md)
- [Gobierno de scope comercial](./docs/architecture/COMMERCIAL_SCOPE_GOVERNANCE_V0.1.md)
- [Universo analítico VENTAS](./docs/architecture/VENTAS_ANALYTICAL_UNIVERSE_V0.1.md)
- [Universo analítico RVM](./docs/architecture/RVM_ANALYTICAL_UNIVERSE_V0.1.md)
- [Universo analítico CRM](./docs/architecture/CRM_ANALYTICAL_UNIVERSE_V0.1.md)
- [MASTER V0.1](./docs/master/MASTER_LAYER_V0.1.md)
- [Mapa físico de la base de datos](./docs/database/README.md)
- [Catálogo completo de tablas](./docs/database/TABLE_CATALOG.md)
- [Relaciones y autoridades de datos](./docs/database/RELATIONSHIPS.md)
- [Capa canónica](./docs/canonical/)
- [Runtime VENTAS](./docs/runtime/)
- [Analytics](./docs/analytics/)

## Fuera de alcance documental

Esta documentación no cubre la capa de adquisición de datos:

- loaders;
- importadores;
- parsing de archivos;
- sincronización de fuentes;
- pipelines de ingesta;
- construcción externa de las tablas de entrada.

Para esta documentación, el runtime comienza con datos ya disponibles y termina en evidencia analítica interpretable por el agente.
