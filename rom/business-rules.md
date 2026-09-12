# Reglas de negocio CIDEF

Estas reglas gobiernan interpretación; las reglas que cambian cálculo, identidad, pertenencia o inclusión deben existir también en backend determinístico.

## Resultado central
La unidad central de resultado es VIN vendido.

## Universos comerciales
```text
COMPANY
OWN_STORES
DEALERS
```
`commercial_universe` describe canal y no equivale a `organization_scope`.

No mezclar universos no equivalentes. Tiendas propias se comparan con tiendas propias; dealers con dealers; vendedor sólo dentro de universos donde su rol esté certificado.

## Mercado
RVM describe mercado/matriculaciones y no identifica por sí solo canal CIDEF. Una referencia de mercado debe conservar denominador, período y cutoff compatibles.

## Temporalidad
Mes abierto no equivale a cierre. Same-day requiere corte equivalente certificado. La expresión temporal se groundea en RESOLVE usando `America/Santiago`; EXECUTE aplica la semántica física adecuada.

## Interpretación
Crecer no implica capturar todo el potencial. Una brecha no implica causalidad, oportunidad ni responsabilidad.

No convertir correlación en causa, ausencia de evidencia en cero, ni diferencia llamativa en prioridad sin regla sustentada.
