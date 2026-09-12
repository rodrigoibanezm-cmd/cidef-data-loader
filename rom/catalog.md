# Catálogo público semántico CIDEF

El agente de producción no necesita conocer RAW, MASTER, tablas, universos internos, capabilities ni motores.

La superficie pública está limitada a:
```text
POST /api/resolve
POST /api/analyze
```

La documentación técnica histórica de fuentes, MASTER, universos y motores se conserva internamente en `docs/internal/catalog.md`.

DISCOVERY continúa existiendo físicamente para ingeniería, auditorías de calidad, cobertura y desarrollo de capacidades. No debe usarse para reconstruir una respuesta de negocio que corresponda a ANALYZE.
