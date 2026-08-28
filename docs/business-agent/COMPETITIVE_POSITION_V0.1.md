# COMPETITIVE_POSITION_V0.1

## OBJETIVO

Definir contrato analítico especializado para Familia 2 — Posición competitiva.

Determinar competencia real, penetración relativa, trayectoria y desplazamiento competitivo usando evidencia externa de mercado procesada.

Contrato superior: `docs/business-agent/QUESTION_FAMILIES_V0.1.md`.

## PRINCIPIO

Competencia NO equivale a:

- marca inmediatamente superior/inferior en ranking;
- mismo segmento nominal;
- mercado total por defecto.

La relación competitiva DEBE derivarse de evidencia de comparabilidad y comportamiento dentro de un mercado relevante.

La competencia es una relación analítica recalculable. NO es atributo MASTER.

## INPUT REQUERIDO

- `fact_mercado` con grain explícito;
- dimensiones de mercado normalizadas;
- producto Cidef vinculable a nomenclatura externa cuando exista evidencia suficiente;
- métricas certificadas de unidades/participación;
- historia temporal suficiente para evaluar trayectoria;
- `cube_mercado` SOLO si agrega eficiencia.

RVM RAW NO es input directo del motor.

## PREGUNTAS

- ¿Quién compite realmente con cada producto Cidef?
- ¿Qué marcas/modelos son comparables y con qué evidencia?
- ¿Cuál es la penetración de Cidef dentro del mercado competitivo relevante?
- ¿La posición relativa está mejorando o empeorando?
- ¿A qué competidores Cidef está ganando terreno?
- ¿Qué competidores están ganando terreno a Cidef?
- ¿Dónde ocurre el desplazamiento competitivo?
- ¿El movimiento es puntual o persistente?
- ¿Qué movimientos son relevantes para marketing, fuerza de venta o portafolio?

## CONSTRUCCIÓN DEL MERCADO COMPETITIVO

Para cada producto/corte analizado, el motor DEBE construir o recibir un conjunto comparable respaldado por evidencia.

Evidencia potencial de comparabilidad:

- segmento/tipo validado;
- modelo/familia comparable;
- rango o posicionamiento cuando exista fuente válida;
- geografía;
- patrones históricos de participación/desplazamiento;
- otras dimensiones certificadas disponibles en `fact_mercado`.

Compartir una etiqueta nominal NO basta para declarar competencia.

## MÉTRICAS / EVIDENCIA MÍNIMA

Por mercado competitivo relevante:

- unidades Cidef/marca/producto;
- unidades del mercado comparable;
- participación relativa;
- cambio de participación;
- trayectoria temporal;
- magnitud del movimiento;
- duración/persistencia;
- consistencia por cortes;
- participación y trayectoria de competidores comparables.

Ranking puede ser evidencia auxiliar. NO define por sí solo competencia.

## DESPLAZAMIENTO COMPETITIVO

### CIDEF GANA TERRENO A COMPETIDOR

Evidencia mínima:

- Cidef gana participación relativa;
- competidor pierde participación dentro del mismo mercado comparable;
- movimiento coincide temporalmente;
- magnitud y persistencia son cuantificables.

OUTPUT debe indicar:

- competidor;
- magnitud;
- período;
- persistencia;
- cortes donde se concentra;
- evidencia de comparabilidad.

NO afirmar causalidad de transferencia de clientes sin evidencia adicional.

### COMPETIDOR GANA TERRENO A CIDEF

Aplicar contrato inverso con las mismas exigencias de evidencia.

## TRAYECTORIA

El motor DEBE distinguir:

- crecimiento absoluto del mercado;
- crecimiento absoluto de Cidef;
- mejora competitiva relativa;
- deterioro competitivo relativo;
- movimiento puntual;
- trayectoria persistente.

Un aumento de unidades NO implica mejora competitiva si el mercado comparable crece más rápido.

## CORTES

Usar SOLO dimensiones validadas por contrato de mercado.

Candidatos:

- región;
- comuna;
- segmento;
- marca;
- familia/modelo;
- versión cuando el mapping sea confiable;
- período.

NO usar cortes cuya nomenclatura o mapping no esté resuelto.

## OUTPUT MÍNIMO

- producto/entidad analizada;
- mercado competitivo relevante;
- competidores comparables;
- evidencia de comparabilidad;
- penetración relativa;
- trayectoria;
- competidores a los que Cidef gana terreno;
- competidores que ganan terreno a Cidef;
- magnitud/persistencia;
- cortes relevantes;
- gaps/incertidumbre.

## REGLAS

- NO consumir RVM RAW directamente.
- NO convertir competencia en atributo MASTER.
- NO usar ranking vecino como definición de competidor.
- NO usar mercado total como denominador por defecto.
- NO inferir causalidad desde correlación temporal.
- NO forzar mapping producto Cidef ↔ producto RVM ambiguo.
- Si falta evidencia para definir mercado comparable, devolver GAP.

## DEPENDENCIAS

```text
RVM / ANAC
→ auditoría + normalización
→ fact_mercado
→ métricas certificadas de mercado
→ cube_mercado opcional
→ motor Familia 2
```

## CRITERIO DE CIERRE V0.1

El contrato está implementable cuando existen:

- grain `fact_mercado` congelado;
- mappings mínimos validados;
- definición determinista de mercado comparable;
- métricas certificadas requeridas;
- validaciones históricas para distinguir movimiento puntual de trayectoria.
