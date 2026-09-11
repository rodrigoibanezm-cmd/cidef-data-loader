# CIDEF Analytical Runtime

Runtime analítico determinista para CIDEF.

Este repositorio contiene la capa que permite a un agente consultar datos de negocio mediante capacidades analíticas controladas. Para efectos de esta documentación, las tablas consumidas por el runtime se consideran entradas ya disponibles: la carga, ingesta y construcción de esas tablas queda fuera de alcance.

## Principios

- **LLM para semántica; motores para cálculo.** El agente interpreta la pregunta y consume resultados deterministas. Los cálculos y reglas de negocio viven en backend.
- **No reconstruction.** El agente no debe reconstruir manualmente identidades, universos, relaciones ni cálculos que pertenecen al runtime.
- **Identidad y universos en backend.** La resolución de entidades y pertenencia ocurre sobre autoridades certificadas del sistema.
- **Contratos explícitos.** Las capabilities públicas exponen entradas y salidas controladas; los detalles físicos internos no deben convertirse en responsabilidad del agente.
- **Separación entre cálculo y presentación.** El flujo conceptual es JSON → motores → JSON → render/agente.

## Arquitectura de alto nivel

```text
Tablas disponibles
      ↓
Identidad / universos / contexto
      ↓
Motores deterministas
      ↓
Router / capabilities públicas
      ↓
Agente
```

El runtime transforma preguntas de negocio en consultas a capacidades deterministas. El agente no reemplaza los motores ni reconstruye su lógica.

## Dominios

El runtime está organizado actualmente alrededor de los siguientes dominios analíticos:

- **VENTAS** — contexto y análisis determinista de ventas.
- **RVM** — contexto y análisis del mercado automotor.
- **CRM** — contexto operacional y comercial de leads.
- **PRICING** — historia y condición comercial publicada de productos.
- **DISCOVERY** — acceso controlado de inspección sobre superficies de datos autorizadas.

## Documentación

La documentación detallada vive en [`docs/`](./docs/).

Su objetivo es describir exclusivamente el sistema existente: qué componentes existen, por qué existen, qué hacen, de qué dependen y qué garantías entregan.

A medida que cada área sea documentada, este README funcionará como router hacia sus documentos canónicos.

## Fuera de alcance

Esta documentación no cubre:

- loaders e ingesta de datos;
- parsing de archivos o fuentes;
- pipelines de carga;
- migraciones de origen;
- roadmap o trabajo futuro;
- diseños todavía no estabilizados.

La documentación describe el **runtime analítico actual**, considerando las tablas de entrada como datos construidos y mantenidos fuera de esta frontera.