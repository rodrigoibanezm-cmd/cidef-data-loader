# Dealers master

## Objetivo
`dealers_master` es la tabla canónica para identificar dealers por RUT y entregar un nombre normalizado a los motores de ventas e inventario.

## Regla de identidad

- `dealer_id`: RUT normalizado sin puntos, guion ni dígito verificador cuando la fuente histórica lo entrega así. No usar IDs artificiales.
- `dealer`: nombre canónico y único del dealer.
- `tipo`: `DEALER` para registros activos de la red.
- `activo`: indica si el dealer debe participar en clasificaciones actuales.
- `notas`: razón social, alias comercial u observación de normalización.

## Clasificación en inventario

Las columnas derivadas en `inventario_vehiculos_global_raw` son:

- `es_dealer`: booleano.
- `dealer_venta`: nombre canónico del dealer.
- `dealer_rut`: RUT resuelto cuando la venta fue canalizada por Forum.
- `dealer_nombre`: nombre resuelto cuando la venta fue canalizada por Forum.

La clasificación tiene dos rutas:

1. Venta directa a dealer: el RUT de `inventario_vehiculos_global_raw.rut` se cruza con `dealers_master.dealer_id`.
2. Venta financiada/canalizada por Forum: `cliente` puede ser `FÓRUM DISTRIBUIDORA S.A.`; el dealer real se recupera desde `notas_venta_raw.comentario` y luego se normaliza al nombre canónico.

No usar `factura IS NULL` para inferir stock dealer: una unidad puede estar facturada a Forum y continuar vigente en el dealer.

## Registros actuales documentados

| dealer_id | dealer | notas |
|---:|---|---|
| 79600500 | AUTOMECÁNICA COLON | |
| 78071163 | AUTOMOTRIZ AUSTRAL SPA | |
| 79528950 | AUTOMOTRIZ CARMONA Y COMPAÑIA LIMITADA | |
| 76068841 | AUTOMOTRIZ FOR CENTER S.A | |
| 96502140 | AUTOMOTRIZ ROSSELOT S.A. | |
| 76506740 | AUTOS OGAZ | COMERCIALIZADORA OGAZ Y OGAZ SPA |
| 76406005 | AUTOS OGAZ PEDRO OGAZ | AUTOMOTRIZ PEDRO ANDRES OGAZ SANTELICES E I R L |
| 77244120 | COMERCIAL COLON LIMITADA | |
| 92909000 | CURIFOR | |
| 78189900 | GELLONA | GELLONA AUTOS Y COMPANIA LIMITADA |
| 96639090 | IMPORT & EXPORT | IMPORT EXPORT STOP S.A. |
| 96668460 | KLASSIK CAR S.A. | |
| 96642160 | PIAMONTE | |
| 76537562 | RENTAL BASILIO | RENTAL BASILIO SPA |
| 76188205 | VALDEPEZ SPA | Alias comercial: CARPOINT |
| 76998631 | VARAS HERMANOS | VARAS HERMANOS SERVICIOS INTEGRALES SPA |
| 76810800 | VEGA ARTUS | AUTOMOTORA VEGA ARTUS LIMITADA |

## Dealers conocidos todavía no incorporados a `dealers_master`

Estos nombres ya aparecen clasificados en `dealer_venta` y deben incorporarse antes de eliminar cualquier fallback histórico:

- AUTOMOTORA MELHUISH RETAIL SPA — RUT `76306357`
- COMERCIAL GRASS & ARUESTE LTDA. — RUT `88867500`
- AUTOMOTRIZ PORTILLO SUR LIMITADA — RUT `76296863`
- AUTOMOTRIZ CORDILLERA S.A. — RUT `79853470`
- ROMANINI — RUT `85234600`
- CITY MOTOR SPA — RUT `76719932`

`MEGACENTER` queda pendiente de identificación de RUT. No crear asociación por inferencia.

## Regla para motores

- `dealers_master` debe ser la fuente canónica para identidad y nombre de dealer.
- No agregar listas de dealers hardcodeadas en motores.
- Mientras existan dealers históricos no incorporados a `dealers_master`, mantener un fallback explícito y documentado para evitar regresiones.
- Cuando `dealers_master` esté completo, retirar el fallback y centralizar toda la resolución en esta tabla.
