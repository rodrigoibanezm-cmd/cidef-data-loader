# MASTER_IMPLEMENTATION_V0.1

## ESTADO

**EN REVISIÓN — IMPLEMENTACIÓN ACTUAL NO VALIDADA.**

Las tablas MASTER desplegadas en Neon `main` NO deben considerarse contrato físico correcto ni base habilitante para la capa canónica.

La revisión 2026-08-28 detectó pérdida material de cobertura respecto de identidades que sí están presentes en las RAW.

## OBJETIVO

Documentar implementación física de MASTER V0.1 una vez corregida y validada.

Contrato lógico, también bajo revisión de cobertura: `docs/master/MASTER_LAYER_V0.1.md`.

## IMPLEMENTACIÓN ACTUAL — EVIDENCIA, NO ESTADO OBJETIVO

Conteos observados en Neon `main`:

- `marcas_master`: 6;
- `modelos_master`: 193;
- `versiones_master`: 241;
- `sucursales_master`: 22;
- `personas_master`: 237;
- `dealers_master`: 7;
- `master_conflicts`: 27.

Estos conteos NO certifican completitud.

La ausencia de duplicados en claves naturales tampoco certifica cobertura del universo RAW.

## HALLAZGO DE COBERTURA

La comparación con MASTER histórica de branch `respaldo` mostró identidades ausentes en la implementación nueva que siguen teniendo evidencia directa en RAW.

Caso confirmado: dealers.

- `respaldo.dealers_master`: 24 identidades.
- 23 de esas 24 tienen match directo por nombre normalizado contra `inventario_vehiculos_global_raw.dealer_venta`.
- Ejemplos con evidencia masiva: Rosselot, For Center, Comercial Colón, Grass & Arueste, Gellona, Carmona, Valdepez, Melhuish Retail, Automecánica Colón, City Motor, Klassik Car.
- `main.dealers_master`: 7 identidades.

Conclusión: la implementación nueva utilizó reglas/fuentes insuficientes para descubrir el universo disponible.

La MASTER histórica NO se considera correcta por definición. Se usa como índice de identidades candidatas para buscar evidencia nuevamente en RAW.

## MÉTODO DE REVISIÓN

Para cada dominio:

```text
MASTER histórica respaldo
→ enumerar identidades candidatas
→ buscar evidencia directa en RAW
→ identificar regla/fuente que permite descubrirlas
→ comparar cobertura con MASTER main
→ definir contrato correcto
→ reconstruir/refrescar MASTER
→ validar exhaustividad + unicidad + conflictos
```

Dominios:

1. producto;
2. sucursal/local;
3. persona;
4. dealer.

## REGLAS

- NO copiar tablas de `respaldo` ciegamente.
- `respaldo` es evidencia histórica y pista de cobertura.
- Toda identidad incorporada DEBE poder justificarse contra fuente vigente o evidencia histórica aceptada explícitamente.
- Validar cobertura, NO solo unicidad.
- No declarar MASTER terminada por ejecución exitosa del SQL.
- No iniciar capa canónica usando MASTER actual mientras esta revisión siga abierta.

## SQL ACTUAL

Implementación bajo revisión:

1. `sql/010_master_schema.sql`
2. `sql/master/020_refresh_producto.sql`
3. `sql/master/021_refresh_sucursal_persona.sql`
4. `sql/master/022_refresh_dealer.sql`
5. `sql/master/023_validate_master.sql`

Estos scripts pueden requerir cambios. NO asumir que representan el contrato final.

## VALIDACIÓN FINAL REQUERIDA

Antes de cerrar MASTER V0.1:

- cobertura reconciliada contra todas las RAW relevantes;
- comparación contra identidades históricas de `respaldo`;
- explicación de toda identidad histórica omitida;
- claves naturales sin duplicados;
- aliases resueltos o explicitados;
- conflictos registrados;
- reglas de refresh aditivo verificadas;
- evidencia de población real en Neon `main`.

## BLOQUEO

MASTER V0.1 permanece abierta.

La capa canónica NO debe considerarse habilitada hasta cerrar esta revisión.
