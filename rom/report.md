# Composición de informes — CIDEF

Responsabilidad: componer **informes asistidos por el agente** a partir de bloques analíticos. No define métricas, no calcula y no reemplaza `synthesis.md` ni `presentation.md`.

```text
pregunta / objetivo del informe
→ orchestrator.md
→ evidencia por bloque
→ synthesis.md
→ report.md
→ presentation.md
→ informe
```

## Principio
Un informe no es una lista fija de métricas ni una concatenación de respuestas. Debe seleccionar y ordenar sólo los bloques que construyen una lectura coherente del período o problema solicitado.

## Estructura base
Cuando corresponda, usar esta progresión:

```text
1. BIG PICTURE
2. RESULTADO VS CONTEXTO
3. QUÉ EXPLICA EL RESULTADO
4. RIESGO / OPORTUNIDAD
5. QUÉ MERECE PROFUNDIZACIÓN
```

No todas las secciones son obligatorias. Omitir cualquiera que no tenga evidencia útil o que no aporte a la pregunta del informe.

## Composición
- cada sección debe responder una pregunta analítica distinta;
- ordenar por importancia, no por fuente ni por capability;
- evitar repetir el mismo hallazgo en varias secciones;
- una cifra puede reaparecer sólo si cambia de función analítica;
- integrar VENTAS, RVM y CRM sólo cuando sean comparables y aporten a la lectura;
- mantener explícitos los límites de evidencia que cambien una conclusión;
- no rellenar secciones para completar una plantilla;
- no transformar incertidumbre en narrativa.

## Profundidad adaptativa
Comenzar en BIG PICTURE y abrir niveles inferiores sólo cuando expliquen, contradigan o localicen un hallazgo material.

```text
CIDEF
→ universo comercial
→ tienda / dealer
→ marca
→ vendedor cuando aplique
→ producto / modelo
```

El informe puede profundizar de forma desigual: una señal importante puede requerir varios niveles y otra quedar correctamente cerrada en el agregado.

## Preguntas de navegación
Durante la construcción, una sección puede revelar una pregunta siguiente útil. El agente puede usarla para continuar investigando antes de cerrar el informe si puede cambiar materialmente la lectura.

En el informe final, `synthesis.md` decide si queda una continuación analítica pendiente. Mostrar como máximo una recomendación de profundización principal, salvo que el usuario pida explícitamente un plan de investigación.

## Informe mensual
Para cierre mensual, la estructura base puede interpretarse como:

```text
BIG PICTURE
→ cómo cerró CIDEF y qué cambió

RESULTADO VS CONTEXTO
→ trayectoria, mercado y posición relativa

QUÉ EXPLICA EL RESULTADO
→ contribuciones relevantes por tienda, marca, vendedor o producto

RIESGO / OPORTUNIDAD
→ señales sustentadas de deterioro o crecimiento no capturado

QUÉ MERECE PROFUNDIZACIÓN
→ bifurcación analítica de mayor valor aún abierta
```

No confundir cierre mensual con reporte descriptivo de todas las métricas disponibles.

## Salida
`report.md` decide estructura y continuidad entre bloques.

`synthesis.md` decide qué hallazgos comunicar dentro de cada bloque.

`presentation.md` decide cómo mostrarlos al usuario.
