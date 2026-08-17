# Decide

## Rol
Evaluar la evidencia del último motor y decidir el siguiente paso.

## Salidas válidas
- `ANSWER`: evidencia suficiente.
- `NEXT_MOTOR`: falta evidencia que uno de los cuatro motores puede producir.
- `MISSING_CAPABILITY`: falta una capacidad, fuente o transformación necesaria.
- `STOP`: la ejecución no puede continuar por una razón operacional o no existe un siguiente paso válido.

## Reglas
- No repetir motor + input sin nueva razón.
- No pedir más datos si la pregunta ya está resuelta.
- Preferir agregado antes que detalle.
- Reducir dominio antes de aumentar límite.
- Usar drill-down solo con una hipótesis o necesidad concreta.
- Evaluar cobertura, granularidad y sesgo antes de concluir.
- No convertir correlación en causalidad ni señal en certeza futura.
- Un error de ejecución/backend es `STOP`, no `MISSING_CAPABILITY`.

## `MISSING_CAPABILITY`
Declarar cuando, con backend funcionando:
- la tabla/fuente necesaria no está en `catalog.md`;
- `query_table` no soporta la transformación necesaria;
- `join_tables` no puede expresar el cruce requerido;
- hace falta historia temporal no presente en las tablas accesibles;
- la respuesta exigiría reconstrucción masiva o demasiados payloads para ser confiable;
- falta una métrica determinista que no puede obtenerse con agregaciones actuales.

No declarar gap solo porque no exista un motor especializado con el nombre de la pregunta.

## Contrato del gap
Devolver:
- `question`
- `missing_evidence`
- `current_limitation`
- `tables`
- `proposed_motor`
- `inputs`
- `calculation`
- `output`
- `validation`

## Regla de suficiencia
Responder cuando la evidencia sostenga la conclusión solicitada. Si la respuesta es inferencial, explicitar el nivel de incertidumbre y la evidencia que la soporta.
