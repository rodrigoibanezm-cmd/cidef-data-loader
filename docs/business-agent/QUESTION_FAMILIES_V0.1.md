# QUESTION FAMILIES V0.1

## Principio

La unidad de diseño es:

**1 familia de preguntas → 1 motor determinista**

Los motores pueden consumir auditores y validadores transversales de libre uso.

El cubo semántico entrega la evidencia común.

Las familias no son reportes descriptivos ni equivalen a páginas de BI. Deben agrupar preguntas de negocio que requieren inferencia determinista, comparación, trayectoria o diagnóstico.

Las fuentes RAW no deben ser consumidas directamente por estos motores de negocio. La evidencia debe llegar previamente auditada, normalizada y procesada por las capas y motores correspondientes.

## Familia 1: expectativa de cierre

Preguntas:

- ¿Cuánto debería vender Cidef este mes?
- ¿Cuánto debería vender cada tienda?
- ¿Cuánto debería vender cada vendedor?
- ¿Cuál es el cierre esperado dado lo observado hasta hoy?
- ¿Qué tan lejos está cada unidad de su cierre esperado?
- ¿La desviación todavía es recuperable?
- ¿Cuándo comienza a ser estadísticamente explicable el cierre del mes?

Esta familia debe usar historia, estacionalidad, ritmo intra-mes y comportamiento relativo.

## Familia 2: posición competitiva

Esta familia no debe limitarse a calcular participación de mercado. Debe reconstruir la posición competitiva relevante para Cidef y cómo esa posición cambia en el tiempo.

Preguntas:

- ¿Quiénes son realmente nuestros competidores para cada familia o conjunto comparable de productos?
- ¿Contra qué marcas o productos debe compararse cada producto Cidef y con qué evidencia se sostiene esa comparación?
- ¿Cuál es nuestra penetración dentro del mercado competitivo relevante, en vez de solo dentro del mercado total?
- ¿Cómo está variando nuestra penetración respecto de nuestros competidores reales?
- ¿A qué competidores les estamos ganando terreno?
- ¿Qué competidores nos están quitando terreno?
- Cuando ganamos participación, ¿qué competidores pierden simultáneamente y con qué persistencia ocurre ese desplazamiento?
- Cuando perdemos participación, ¿hacia qué competidores parece desplazarse el mercado?
- ¿El desplazamiento competitivo es general o está concentrado en determinadas regiones, segmentos, familias o modelos?
- ¿Un cambio de participación parece coyuntural o constituye una trayectoria competitiva persistente?
- ¿Qué movimientos competitivos podrían convertirse en evidencia accionable para marketing, fuerza de venta o gestión de portafolio?

La definición de competencia no debe fijarse como un atributo estático de MASTER. Es una relación analítica que debe poder recalcularse con evidencia procesada de mercado y producto.

La evidencia de mercado —incluida RVM— debe pasar primero por sus procesos de auditoría, normalización y preparación. El motor de posición competitiva no debe consultar directamente una RAW.

## Familia 3: deterioro y red flags

El objetivo no es solamente constatar que una unidad ya cayó. Debe detectar señales tempranas de cambio de trayectoria antes de que el deterioro sea evidente en el resultado final.

Preguntas:

- ¿Qué vendedores o tiendas muestran deterioro respecto de su propia historia?
- ¿Desde cuándo comenzó el deterioro y cuál fue la primera señal observable?
- ¿Qué cambios de trayectoria todavía son pequeños en magnitud pero estadísticamente anormales para esa unidad?
- ¿Quién depende excesivamente de los últimos días del mes?
- ¿Quién presenta alta volatilidad?
- ¿Quién acumula notas de venta que no llegan a factura?
- ¿Quién aumenta sus tiempos de cierre?
- ¿Qué tiendas parecen sanas en ventas totales pero muestran señales de fragilidad?
- ¿Qué patrones observados históricamente suelen anteceder un deterioro posterior?

Un red flag debe representar una señal que merece atención antes de que el problema quede completamente reflejado en el resultado. Puede provenir de patrones históricos validados o de reglas de negocio explícitas que luego deben contrastarse contra la evidencia.

## Familia 4: desempeño relativo

Preguntas:

- ¿Qué tan lejos está una tienda del comportamiento esperado para Cidef?
- ¿Qué tan lejos está un vendedor del comportamiento histórico de vendedores comparables de esa tienda?
- ¿Una mala semana es ruido o parte de un deterioro persistente?
- ¿Qué vendedores están sistemáticamente por debajo o sobre su contexto comparable?

## Familia 5: accionabilidad

Objetivo:

No inventar recomendaciones comerciales sin evidencia suficiente.

El agente debe primero identificar:

- dónde existe una desviación;
- desde cuándo;
- cuánto mide;
- qué evidencia la explica;
- qué operación, vendedor, tienda o dimensión requiere atención.

Ejemplo:

> “Hay que gestionar a este vendedor esta semana porque su ritmo está bajo su rango histórico y además mantiene varias notas de venta envejecidas sin factura.”

La acción específica puede requerir contexto humano, CRM o Forum.
