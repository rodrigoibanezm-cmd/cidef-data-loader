# VENTAS_IDENTITY_COVERAGE_V0.1

## Objetivo

Auditar qué proporción de `ventas_raw` puede atribuirse determinísticamente a sucursal y persona canónicas antes de construir comparaciones por tienda o vendedor.

## Motor

```text
ventas_identity_coverage_v01
```

Input:

```json
{}
```

## Fuentes

```text
ventas_raw
sucursales_master
personas_master
```

## Grain

```text
1 fila fuente de ventas_raw
```

Este motor audita identidad RAW -> MASTER. No deduplica ventas por VIN y no calcula desempeño.

## Resolución

Sucursal:

```text
ventas_raw.id_sucursal_vta
-> igualdad exacta
sucursales_master.id_sucursal_vta
-> sucursal_id
```

Vendedor:

```text
ventas_raw.nombre_usuario
-> igualdad exacta
personas_master.usuario_canonico
-> persona_id
```

Cada dimensión se clasifica por fila como:

```text
RESUELTA     = exactamente 1 identidad MASTER
NO_RESUELTA  = 0 identidades MASTER
AMBIGUA      = más de 1 identidad MASTER
```

## Output

```text
rows_total
rows_store_resolved
rows_store_unresolved
rows_store_ambiguous
rows_seller_resolved
rows_seller_unresolved
rows_seller_ambiguous
rows_both_resolved
coverage_pct
unresolved
ambiguous
resolved_to_unvalidated_person_rows
validation
warnings
```

## Validaciones

- sucursal: `total = resueltas + no_resueltas + ambiguas`;
- vendedor: `total = resueltas + no_resueltas + ambiguas`;
- cobertura conjunta no puede superar cobertura de cada dimensión;
- ninguna llave MASTER debe resolver a más de una identidad.

## Política

- runtime only;
- no tablas ni vistas nuevas;
- no normalización textual para forzar matches;
- no inferir rol histórico desde la existencia de una venta;
- `personas_master.validated=false` se reporta como warning, no como identidad alternativa;
- el motor mide cobertura de identidad; no define comparables ni desempeño relativo.

## Uso posterior

Familia 4 puede reutilizar estas mismas llaves para enriquecer `ventas_context_v01` con identidad canónica y construir series por tienda/vendedor sin redefinir MASTER.
