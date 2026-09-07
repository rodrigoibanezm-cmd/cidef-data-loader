# Intake — CIDEF

## Responsabilidad
Convertir una pregunta de negocio en el **plan mínimo de evidencia**. No partir desde tablas ni motores físicos.

```text
pregunta → intención → dominio(s) → concepto(s) de negocio → evidencia mínima → capability(s)
```

`schema.json` define capabilities e inputs. `business-rules.md` define reglas y comparabilidad. `business-semantics.md` define qué evidencia permite declarar cada concepto de negocio. La secuencia posterior pertenece a `orchestrator.md`.

## 1. Clasificar intención
**DESCRIPTIVA:** pide un hecho acotado. Usar la capability mínima suficiente.

**ANALÍTICA / EVALUATIVA / DIAGNÓSTICA:** la lectura puede cambiar con contexto, trayectoria, comparación, explicación, riesgo u oportunidad. Determinar primero qué conceptos deben evaluarse y qué evidencia mínima exige cada uno.

**ACCIÓN / PRIORIZACIÓN:** pide focos, tareas o decisiones operativas. No partir generando acciones. Primero construir diagnóstico sustentado; sólo después evaluar accionabilidad y prioridad según `business-semantics.md`.

No ampliar una pregunta descriptiva ni mezclar preguntas superiores salvo que el usuario pida una lectura integrada.

## 2. Elegir dominio
Los dominios analíticos son:
```text
VENTAS  resultado y desempeño comercial CIDEF
RVM     mercado, share, posición y contexto competitivo
CRM     demanda, gestión y conversión observable
```

Una pregunta puede requerir uno o varios dominios. `LONGITUDINAL` no es un dominio: es contexto temporal activado cuando la evolución sea material. `DISCOVERY` tampoco es un dominio analítico: se usa sólo cuando falta evidencia o una capability encapsulada.

El agente selecciona dominios y capabilities públicas, nunca motores físicos.

## 3. Traducir concepto → evidencia mínima
Antes de llamar capabilities, identificar qué concepto de negocio se intenta sostener.

Ejemplos:
- **oportunidad** → resultado observado + referencia válida + brecha + evidencia de disponibilidad/capturabilidad;
- **deterioro** → empeoramiento + referencia válida + soporte temporal/comparativo suficiente;
- **ventaja** → desempeño favorable + referencia válida + diferencial;
- **riesgo** → señal adversa actual + evidencia suficiente para sostener posible deterioro futuro sin afirmar causalidad;
- **red flag / prioridad** → sólo con materialidad, excepcionalidad o criterio determinista explícito y accionabilidad cuando corresponda.

Si falta una pieza obligatoria, bajar el nivel de conclusión en vez de compensarla con inferencia.

## 4. Evidencia mínima
Cada llamada debe responder una necesidad concreta y poder cambiar, reducir o cerrar el análisis.

Reglas:
- contexto de dominio cuando pueda cambiar la interpretación;
- evidencia base antes que derivada;
- resolver dependencias en secuencia;
- reutilizar evidencia vigente del mismo universo/período;
- detenerse cuando la evidencia sea suficiente;
- no llamar capacidades sólo porque existen;
- respetar completitud y compatibilidad temporal entre fuentes.

Usar contexto longitudinal cuando la evolución temporal sea material; no por rutina.

## 5. DISCOVERY
Usarlo sólo para validar estructura, cobertura o una relación aún no encapsulada.

Orden según necesidad:
`LIST_TABLES → TABLE_SCHEMA → PROFILE_TABLE → QUERY_TABLE`.

No perfilar por rutina, descargar filas si basta un agregado ni reconstruir manualmente una capability AVAILABLE.

RAW aporta evidencia fuente; MASTER aporta identidad y relaciones certificadas. No sustituir MASTER con normalización textual ad hoc.

## 6. Nueva capacidad
Sólo si las capabilities actuales no pueden responder confiablemente.

```text
pregunta
→ cálculo necesario
→ variables/evidencia mínima
→ prueba real
→ reconciliación
→ lógica determinista demostrada
→ contrato
```

No diseñar ni implementar un motor antes de demostrar el cálculo con evidencia real. No crear abstracciones por anticipación.

Una capacidad faltante debe identificar exactamente `missing_evidence`, `required_relationship` y por qué la superficie actual es insuficiente.

## Checklist
Antes de llamar:
- ¿qué concepto intento demostrar?
- ¿qué evidencia mínima exige `business-semantics.md`?
- ¿qué dominio o dominios la contienen?
- ¿es la capability mínima suficiente?
- ¿depende de evidencia que aún no tengo?
- ¿el universo y período son correctos?
- ¿puedo reutilizar contexto?
- ¿el resultado puede cambiar o cerrar el análisis?

Si no puede, no ejecutar la llamada.
