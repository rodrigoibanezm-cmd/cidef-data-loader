# QUESTION FAMILIES V0.1

## CONTRATO

- 1 familia de preguntas = 1 motor determinista.
- Las preguntas definen requisitos de datos y cálculo.
- Los motores de negocio NO consumen RAW.
- Evidencia RAW debe llegar auditada, normalizada y procesada.
- Auditores y validadores pueden ser transversales.
- Cubos/marts entregan evidencia; NO definen verdad ni lógica de negocio.
- Las familias NO son reportes BI. Deben resolver inferencia, comparación, trayectoria o diagnóstico.

## FAMILIA 1 — EXPECTATIVA DE CIERRE

### OBJETIVO
Estimar cierre esperado y desviación respecto del comportamiento esperable.

### PREGUNTAS GUÍA
- ¿Cuánto debería vender Cidef este mes?
- ¿Cuánto debería vender cada tienda?
- ¿Cuánto debería vender cada vendedor?
- ¿Cuál es el cierre esperado dado lo observado hasta hoy?
- ¿Qué tan lejos está cada unidad de su cierre esperado?
- ¿La desviación todavía es recuperable?
- ¿Cuándo comienza a ser estadísticamente explicable el cierre del mes?

### REGLAS
- Usar historia, estacionalidad, ritmo intra-mes y comportamiento relativo.
- Separar resultado observado, esperado y proyección.

## FAMILIA 2 — POSICIÓN COMPETITIVA

### OBJETIVO
Determinar competencia real, penetración relativa y trayectoria competitiva de Cidef.

### PREGUNTAS GUÍA
- ¿Quién compite realmente con cada producto Cidef?
- ¿Contra qué marcas/modelos debe compararse y con qué evidencia?
- ¿Cuál es nuestra penetración dentro del mercado competitivo relevante?
- ¿Nuestra penetración competitiva mejora o empeora?
- ¿A quién le estamos quitando mercado?
- ¿Quién nos está quitando mercado?
- ¿Dónde ocurre el desplazamiento competitivo?
- ¿El movimiento es persistente o ruido?
- ¿Qué movimientos son relevantes para marketing, fuerza de venta o portafolio?

### RESPUESTAS ESPERADAS

**¿Quién es realmente la competencia de un producto Cidef?**
- Identificar conjunto competitivo con evidencia de producto y mercado.
- Exponer comparables y evidencia de comparabilidad.
- NO asumir competencia solo por compartir segmento nominal.

**¿A quién le estamos quitando mercado?**
- Detectar competidores que pierden participación mientras Cidef gana dentro del mismo mercado comparable.
- Cuantificar magnitud, persistencia y concentración del desplazamiento.
- NO presentar simultaneidad como causalidad demostrada.

**¿Quién nos está quitando mercado?**
- Detectar competidores que ganan participación mientras Cidef pierde.
- Cuantificar magnitud y localizar el desplazamiento.

**¿Estamos penetrando mejor o peor que hace seis meses?**
- Medir trayectoria dentro del mercado competitivo relevante.
- Comparar contra períodos anteriores.
- Distinguir crecimiento absoluto de mejora competitiva.

**¿Dónde le ganamos a un competidor y dónde nos gana?**
- Descomponer por cortes soportados: región, segmento, familia, modelo u otros validados.
- Identificar fortalezas y debilidades localizadas.

**¿Este cambio competitivo es real o ruido?**
- Evaluar magnitud, duración, consistencia y comportamiento histórico.
- Distinguir fluctuación puntual de trayectoria persistente.

### REGLAS
- Competencia es relación analítica recalculable; NO atributo MASTER.
- Comparar dentro de mercados competitivos relevantes; NO usar mercado total por defecto.
- RVM y otras fuentes de mercado deben estar auditadas, normalizadas y procesadas antes del motor.
- Correlación temporal NO implica causalidad.

### OUTPUT MÍNIMO
Competidores comparables + evidencia + penetración relativa + trayectoria + desplazamientos + cortes relevantes.

## FAMILIA 3 — DETERIORO Y RED FLAGS

### OBJETIVO
Detectar cambios adversos de trayectoria antes de que el deterioro sea evidente en el resultado final.

### PREGUNTAS GUÍA
- ¿Qué vendedores o tiendas se deterioran respecto de su propia historia?
- ¿Desde cuándo y cuál fue la primera señal?
- ¿Qué cambios pequeños son anormales para esa unidad?
- ¿Quién depende excesivamente de los últimos días del mes?
- ¿Quién presenta alta volatilidad?
- ¿Quién acumula notas de venta sin llegar a factura?
- ¿Quién aumenta sus tiempos de cierre?
- ¿Qué tiendas parecen sanas pero muestran fragilidad?
- ¿Qué patrones históricos suelen anteceder deterioro?

### REGLAS
- Red flag = señal que merece atención antes de que el problema quede reflejado completamente en el resultado.
- Señales deben provenir de patrones históricos validados o reglas explícitas contrastadas con evidencia.

## FAMILIA 4 — DESEMPEÑO RELATIVO

### OBJETIVO
Comparar cada unidad contra un contexto comparable y contra su trayectoria esperable.

### PREGUNTAS GUÍA
- ¿Qué tan lejos está una tienda del comportamiento esperado para Cidef?
- ¿Qué tan lejos está un vendedor de vendedores comparables de esa tienda?
- ¿Una mala semana es ruido o deterioro persistente?
- ¿Quién está sistemáticamente por debajo o sobre su contexto comparable?

## FAMILIA 5 — ACCIONABILIDAD

### OBJETIVO
Identificar qué requiere atención y por qué. NO inventar recomendaciones sin evidencia.

### OUTPUT MÍNIMO
- desviación detectada;
- inicio de la desviación;
- magnitud;
- evidencia explicativa;
- operación, vendedor, tienda o dimensión afectada.

### REGLAS
- La acción específica puede requerir contexto humano, CRM, Forum u otra fuente operacional.
- Sin evidencia suficiente, emitir gap; NO completar con inferencia del LLM.

## PRINCIPIO DE DISEÑO POSTERIOR

MASTER, hechos canónicos, métricas y cubos deben habilitar estas preguntas.

NO convertir respuestas analíticas en atributos estáticos para simplificar motores futuros.

Toda nueva capa debe justificar su existencia por preguntas que habilita, identidad que resuelve, hecho que representa o métrica que certifica.
