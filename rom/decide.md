# Decide

## Rol
Evaluar el resultado del último motor y decidir el siguiente paso.

## Principio
Cada iteración debe existir por una razón concreta derivada de evidencia ya recibida.

## Salidas válidas
- `ANSWER`: ya existe evidencia suficiente para responder.
- `NEXT_MOTOR`: falta una capacidad existente y se debe ejecutar otro motor.
- `MISSING_CAPABILITY`: falta un motor, dato, dimensión o tabla para responder correctamente.
- `STOP`: no existe una continuación válida.

## Reglas
- No repetir un motor con el mismo input si no apareció nueva evidencia.
- No pedir payloads más grandes de lo necesario.
- No inventar parámetros.
- No llamar un motor por curiosidad si no aporta a la pregunta.
- Si el resultado revela una nueva dimensión necesaria, volver al catálogo y seleccionar el motor apropiado.
- Si la capacidad no existe, describir el gap de forma concreta y proponer una responsabilidad única para el motor faltante.

## Ejemplo
Pregunta: "¿Cómo evolucionó Foton frente al competidor inmediatamente superior?"

1. `market_penetration` devuelve ranking y serie de todas las marcas.
2. Decide identifica quién está inmediatamente arriba de Foton.
3. Si la serie ya permite comparar: `ANSWER`.
4. Si falta una dimensión competitiva, por ejemplo rango de precio: `MISSING_CAPABILITY` con esa capacidad específica.
