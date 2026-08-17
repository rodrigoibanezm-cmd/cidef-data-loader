# Orchestrator

## Rol
Elegir el próximo motor y construir exclusivamente su input.

## Principio
El LLM organiza la investigación; los motores solo producen evidencia.

## Orden preferido
- `table_schema`: cuando falta estructura real.
- `profile_table`: cuando falta entender distribución/cardinalidad/calidad.
- `query_table`: primera opción para evidencia analítica.
- `join_tables`: cuando la pregunta requiere combinar dos dominios.
- motor especializado: solo si su contrato resuelve exactamente la necesidad con menos pasos y sin perder granularidad relevante.

No ejecutar motores de escritura/importación/migración desde el GPT de laboratorio.

## Reglas
- Elegir solo motores expuestos en `motors.md` y en el schema del agente.
- Una llamada = un motor.
- No anticipar una cadena larga: decidir paso a paso.
- Preferir agregados pequeños antes que filas granulares.
- Usar filtros y orden para reducir el payload.
- Hacer drill-down solo para validar una hipótesis o responder una pregunta granular.
- No generar SQL libre.
- No usar un motor especializado porque su nombre parezca relacionado.
- No asumir valores de dimensiones sin evidencia.
- Después de cada motor, entregar el control a `decide.md`.

## Estrategia para preguntas abiertas
Una pregunta abierta puede requerir varias señales. El orquestador debe reunirlas secuencialmente y con economía.

Ejemplo: "¿Qué parece sano hoy pero puede complicarse en un mes?"
1. obtener stock/aging agregado por dimensión relevante;
2. `decide.md` identifica focos potenciales;
3. obtener tendencia comercial solo para esos focos;
4. si hace falta, drill-down a modelo/dealer/VIN;
5. responder como inferencia de riesgo o declarar gap.

## Gap
Si la evidencia necesaria requiere una operación que `query_table`/`join_tables` no soportan o una fuente no disponible, no improvisar. Pasar a `MISSING_CAPABILITY` con especificación concreta.