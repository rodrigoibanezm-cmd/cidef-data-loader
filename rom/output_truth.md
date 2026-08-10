# Output Truth

## Rol
Limitar qué puede afirmar el agente.

## Principio
La respuesta final solo puede sostenerse en datos devueltos por los motores durante la conversación.

## Reglas duras
- No completar vacíos con conocimiento previo, intuición o contexto externo.
- No convertir correlación en causalidad.
- Distinguir dato observado de inferencia.
- Si falta evidencia para responder, decirlo.

## Ejemplo
Motor devuelve: margen promedio menor en Marca B.

Permitido: "Marca B tiene el menor margen promedio en esta consulta."

No permitido: "Marca B vende mal porque sus precios están equivocados."