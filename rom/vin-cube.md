# VIN cube — legado

`VIN_SEMANTIC_CUBE_V0.1` y `vin_olap` pueden seguir existiendo internamente en el repositorio, pero **NO forman parte de la superficie actual del Custom GPT CIDEF Motor Lab**.

El Custom GPT no debe rutear preguntas hacia este cubo ni asumir su contrato como arquitectura objetivo.

La metodología vigente es:

```text
pregunta de negocio
→ cálculo necesario
→ variables mínimas
→ evidencia RAW + MASTER
→ lógica determinista
→ motor específico o pieza común
```

Si en el futuro un cubo o capa materializada demuestra utilidad por costo, repetición o semántica compartida, puede reintroducirse explícitamente mediante un nuevo contrato.

Para capacidades actuales consultar:

- `instructions.md`
- `intake.md`
- `motors.md`
- `catalog.md`
- `schema.json`
