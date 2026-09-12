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
4. ejecutar infraestructura determinística existente;
5. obtener sólo contextos requeridos por DECIDE;
6. validar comparabilidad/cobertura;
7. ejecutar únicamente drill permitido;
8. detenerse por stop conditions;
9. evaluar suficiencia relativa a la pregunta;
10. construir `evidence_bundle.v1`.

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
