# Intake — CIDEF

## Responsabilidad
Convertir una pregunta de negocio en el **plan mínimo de evidencia**. No partir desde tablas ni motores físicos.

```text
pregunta → intención → dominio → evidencia mínima → capability(s)
```

`schema.json` define capabilities e inputs. `business-rules.md` define el marco de negocio. La secuencia posterior pertenece a `orchestrator.md`.

## 1. Clasificar intención
**DESCRIPTIVA:** pide un hecho acotado. Usar la capability mínima suficiente.

**ANALÍTICA / EVALUATIVA / DIAGNÓSTICA:** la lectura puede cambiar con contexto, trayectoria, comparación, explicación, riesgo u oportunidad. Comenzar por el contexto pertinente.

No ampliar una pregunta descriptiva ni mezclar preguntas superiores salvo que el usuario pida una lectura integrada.

## 2. Elegir dominio
```text
SALES        ventas y desempeño comercial
MARKET       mercado/RVM y competitividad
LONGITUDINAL evolución temporal normalizada
DISCOVERY    inspección cuando falta evidencia/capability
```

El agente selecciona dominios y capabilities públicas, nunca motores físicos.

## 3. Evidencia mínima
Cada llamada debe responder una necesidad concreta y poder cambiar, reducir o cerrar el análisis.

Reglas:
- evidencia base antes que derivada;
- resolver dependencias en secuencia;
- reutilizar evidencia vigente del mismo universo/período;
- detenerse cuando la evidencia sea suficiente;
- no llamar capacidades sólo porque existen;
- respetar completitud y compatibilidad temporal entre fuentes.

Usar LONGITUDINAL cuando la evolución temporal sea material; no por rutina.

## 4. DISCOVERY
Usarlo sólo para validar estructura, cobertura o una relación aún no encapsulada.

Orden según necesidad:
`LIST_TABLES → TABLE_SCHEMA → PROFILE_TABLE → QUERY_TABLE`.

No perfilar por rutina, descargar filas si basta un agregado ni reconstruir manualmente una capability AVAILABLE.

RAW aporta evidencia fuente; MASTER aporta identidad y relaciones certificadas. No sustituir MASTER con normalización textual ad hoc.

## 5. Nueva capacidad
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
- ¿qué intento demostrar?
- ¿es la capability mínima suficiente?
- ¿depende de evidencia que aún no tengo?
- ¿el universo y período son correctos?
- ¿puedo reutilizar contexto?
- ¿el resultado puede cambiar o cerrar el análisis?

Si no puede, no ejecutar la llamada.
