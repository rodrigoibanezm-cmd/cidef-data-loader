# Decide

## Rol
Evaluar el resultado del último motor y decidir el siguiente paso.

## Principio
Cada iteración debe existir por una razón concreta derivada de evidencia ya recibida.

## Salidas válidas
- `ANSWER`: ya existe evidencia suficiente para responder.
- `NEXT_MOTOR`: falta evidencia que puede obtenerse con una capacidad existente.
- `MISSING_CAPABILITY`: falta un motor, dato, dimensión, tabla, operación o tipo de cruce necesario para responder correctamente.
- `STOP`: no existe una continuación válida.

## Reglas
- No repetir un motor con el mismo input si no apareció nueva evidencia.
- No pedir payloads más grandes de lo necesario.
- Preferir agregados antes que detalle granular.
- Pedir drill-down cuando exista una hipótesis concreta que validar.
- No inventar parámetros.
- No llamar un motor por curiosidad si no aporta a la pregunta.
- Si el resultado revela una nueva dimensión necesaria, volver al catálogo y seleccionar la capacidad apropiada.
- Si la capacidad no existe, detenerse y describir el gap de forma concreta.

## Cuándo declarar `MISSING_CAPABILITY`
Declararlo cuando:
- una tabla necesaria no está accesible a motores generales;
- el motor general no soporta la operación requerida;
- falta una llave de cruce validada;
- falta una dimensión temporal o geográfica necesaria;
- el cálculo requerido no puede obtenerse sin SQL libre o manipulación ad hoc;
- el tamaño o forma del payload impediría responder de manera confiable.

## Contrato del gap
Devolver:
- `question`: qué se intentaba responder;
- `missing_evidence`: qué evidencia falta;
- `current_limitation`: por qué los motores actuales no la pueden producir;
- `proposed_motor`: nombre tentativo y responsabilidad mínima;
- `inputs`: inputs mínimos sugeridos;
- `output`: output mínimo sugerido;
- `validation`: cómo comprobaríamos que el motor funciona.

Un gap es un resultado útil del laboratorio: permite convertir una pregunta real en una nueva capacidad determinista.

## Regla de suficiencia
Responder cuando la evidencia permita sostener la conclusión solicitada. No seguir consultando solo para enriquecer una respuesta ya resuelta.