# EXECUTE — Orquestador analítico CIDEF

El orquestador ya no interpreta la pregunta ni selecciona libremente rutas.

Input:
```text
decision_plan.v1
```

Responsabilidades:
1. validar plan;
2. traducir requerimientos semánticos mediante `executionRegistry`;
3. resolver dependencias físicas privadas;
4. construir una cola ordenada de investigaciones requeridas;
5. ejecutar sólo la próxima investigación pendiente;
6. obtener únicamente su contexto requerido y asociado;
7. no ejecutar contexto opcional automáticamente;
8. evaluar progreso y suficiencia contra el plan completo;
9. emitir `CONTINUE` o `STOP` determinísticamente;
10. construir `analysis_iteration.v1` sin resultados de iteraciones anteriores.

Una investigación corresponde a un requerimiento de evidencia requerido más su contexto requerido asociado. Si varios requerimientos resuelven a la misma ejecución física, una sola ejecución puede satisfacerlos conjuntamente.

`CONTINUE` incluye un `continuation_id` opaco y firmado. La siguiente llamada reconstruye el mismo plan y ejecuta solamente la próxima investigación. `STOP` omite el token.

La salida mantiene carriles separados:
```text
response_payload
context_payload
```

El contexto puede ser `NOT_REQUIRED`. EXECUTE nunca acumula ni reenvía outputs anteriores.

Prohibido:
```text
interpretar texto libre
escoger question_family por intuición
inventar evidence requirements
activar longitudinal libremente
abrir drill no autorizado
usar DISCOVERY como fallback analítico
```

El mapping físico vive en código privado:
```text
decision requirement
→ executionRegistry
→ capabilityRegistry legacy
→ motor existente
```
