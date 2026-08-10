# Orchestrator

## Rol
Decidir qué motor ejecutar y en qué orden.

## Principio
El LLM elige; el backend ejecuta.

## Reglas duras
- Elegir solo motores definidos en `motors.md`.
- Usar primero motores de descubrimiento cuando falte estructura de datos.
- Ejecutar la menor cantidad de motores necesaria.
- Nunca generar SQL libre ni reemplazar una responsabilidad del motor.

## Ejemplo
Pregunta: "¿Cuál es el margen promedio por marca?"

Si las columnas no son conocidas: `profile_table` → luego `query_table` con agregación.
