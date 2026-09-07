# Reglas de negocio CIDEF

Este documento contiene criterios permanentes de negocio que orientan cómo el agente debe seleccionar, interpretar y priorizar evidencia.

No reemplaza los cálculos deterministas ni la evidencia operacional. Su función es establecer qué importa para CIDEF y bajo qué marco debe interpretarse.

Una regla que afecte cálculos, identidad, inclusión o exclusión de registros, pertenencia a universos o definición de métricas debe implementarse además en la capa determinista correspondiente. Este documento orienta al agente; no reemplaza contratos deterministas.

## 1. Unidad central de negocio

La unidad canónica de resultado comercial es el **VIN vendido**.

El agente debe orientar prioritariamente el análisis a preguntas que permitan entender, proteger o aumentar VIN.

Preguntas centrales:

- ¿Cómo vendemos más VIN?
- ¿Dónde existe capacidad de crecer más?
- ¿Dónde estamos creciendo menos de lo que razonablemente podríamos?
- ¿Dónde estamos dejando crecimiento disponible sin capturar?
- ¿Dónde existen VIN actuales o futuros en riesgo?
- ¿Qué tiendas están operando bajo su nivel esperable?
- ¿Qué tiendas muestran señales de deterioro?
- ¿Cómo crece CIDEF respecto del mercado?
- ¿Cómo crecen nuestras marcas respecto de sus mercados?
- ¿Qué parte del crecimiento disponible estamos capturando?

## 2. Prioridad analítica

El agente no debe tratar todos los fenómenos observables como igualmente relevantes.

Salvo que la pregunta lo requiera explícitamente, no son objetivos centrales:

- valor del stock;
- costos;
- margen;
- precio;
- flujo administrativo de venta;
- eficiencia documental;
- problemas operacionales que no tengan vínculo demostrable con VIN.

Estos datos pueden utilizarse como evidencia explicativa cuando sean necesarios, pero no deben desplazar al VIN como variable objetivo.

La pregunta principal no es:

> ¿Qué está raro?

La pregunta principal es:

> ¿Qué explica el nivel, crecimiento, riesgo o potencial de VIN?

## 3. Contexto de CIDEF

CIDEF no debe ser analizado bajo la presunción de que existe una crisis, un problema estructural o errores graves.

La compañía viene de varios años de crecimiento y buenos resultados.

Por lo tanto, el agente no debe buscar problemas artificialmente ni transformar toda desviación en una señal negativa.

El desafío analítico es más exigente:

> encontrar dónde un negocio que ya funciona bien podría estar capturando menos crecimiento del disponible.

El objetivo es detectar diferencias entre:

- crecer;
- crecer bien;
- crecer tanto como era razonablemente esperable;
- capturar todo el crecimiento disponible.

## 4. Oportunidad antes que defecto

Cuando exista evidencia suficiente, el agente debe priorizar preguntas como:

- ¿qué tienda podría vender más VIN de los que vende?;
- ¿qué tienda está perdiendo peso aunque todavía crezca?;
- ¿qué marca crece, pero menos que su mercado?;
- ¿qué tienda está por debajo de su trayectoria o de pares comparables?;
- ¿dónde la demanda parece existir pero no se convierte proporcionalmente en VIN?;
- ¿qué crecimiento parece disponible pero no capturado?;
- ¿dónde aparece un deterioro antes de que se convierta en una caída material?

Una tienda que crece puede seguir presentando una oportunidad.

Una marca que crece puede estar perdiendo posición relativa.

Un resultado positivo no implica necesariamente que se esté capturando todo el potencial disponible.

## 5. Interpretación de riesgo

“Riesgo” no significa automáticamente que algo esté mal.

Debe utilizarse para describir evidencia de que VIN actuales o futuros podrían deteriorarse, por ejemplo:

- desaceleración persistente;
- pérdida de participación interna;
- crecimiento inferior al contexto relevante;
- deterioro respecto de la propia trayectoria;
- divergencia consistente frente a pares;
- deterioro comercial observable antes de materializarse completamente en VIN.

No declarar causalidad cuando sólo existe asociación.

No declarar deterioro cuando la evidencia no lo soporta.

## 6. Universo comercial

Antes de ejecutar un análisis debe fijarse el universo comercial pertinente.

Los universos principales son:

```text
COMPANY
OWN_STORES
DEALERS
```

`commercial_universe` describe el canal comercial. Es independiente de `organization_scope`, que identifica la organización comercial pertinente en RVM.

El principio operativo es:

> DOMAIN → FILTER → GRAIN → METRIC

Un filtro o grain puede reducir el dominio, pero nunca ampliarlo ni redefinirlo.

### 6.1 COMPANY, OWN_STORES y DEALERS

CIDEF comercializa vehículos mediante dos redes diferentes:

```text
OWN_STORES
= tiendas propias CIDEF

DEALERS
= red de concesionarios independientes
```

Ambos contribuyen al resultado total de CIDEF, pero **no constituyen el mismo universo comercial y no deben analizarse como si fueran equivalentes**.

Una tienda propia es una operación comercial directamente gestionada por CIDEF.

Un dealer es un tercero que comercializa vehículos CIDEF dentro de su propia operación, territorio y contexto competitivo.

Por lo tanto:

> Tiendas propias y dealers pueden sumarse para responder preguntas corporativas, pero no deben mezclarse para evaluar desempeño, participación, crecimiento, riesgo u oportunidad de una tienda o dealer individual.

Si la pregunta se refiere a tiendas propias, el universo debe ser `OWN_STORES`.

Ejemplo correcto:

```text
Bellavista / VIN totales de OWN_STORES
```

Ejemplo incorrecto para evaluar posición de Bellavista dentro de tiendas propias:

```text
Bellavista / VIN totales de COMPANY
```

Si la pregunta se refiere a dealers, debe utilizarse `DEALERS`.

Sólo las preguntas explícitamente corporativas deben utilizar `COMPANY`, donde pueden integrarse ambos canales manteniendo visible su composición:

```text
COMPANY
├── OWN_STORES
└── DEALERS
```

No utilizar `COMPANY` como denominador de una evaluación individual de tienda propia o dealer salvo que la métrica esté explícitamente definida como contribución o mix dentro del resultado corporativo.

### 6.2 Comparabilidad de métricas entre universos

Una división o comparación sólo es válida cuando numerador y denominador pertenecen al mismo universo comercial, salvo que la definición canónica de la métrica establezca explícitamente una relación válida entre universos, por ejemplo parte respecto de su universo padre.

Ejemplos válidos:

```text
crecimiento OWN_STORES
= OWN_STORES período t vs OWN_STORES período t-1

crecimiento DEALERS
= DEALERS período t vs DEALERS período t-1

mix OWN_STORES dentro de CIDEF
= OWN_STORES / COMPANY

mix DEALERS dentro de CIDEF
= DEALERS / COMPANY
```

La excepción `OWN_STORES / COMPANY` o `DEALERS / COMPANY` no autoriza comparaciones arbitrarias: sólo es válida cuando la métrica determinista define explícitamente esa relación como mix o contribución corporativa.

### 6.3 El análisis de tiendas y dealers es distinto

No asumir que una metodología diseñada para tiendas propias es automáticamente válida para dealers.

#### OWN_STORES

Permiten analizar directamente variables organizacionales internas, cuando existe evidencia:

```text
tienda
→ marca
→ vendedor
→ producto/modelo
→ CRM
→ VIN
```

Esto permite estudiar gestión comercial, conversión, vendedores, posición interna entre tiendas y otros fenómenos propios de una operación controlada por CIDEF.

#### DEALERS

Deben analizarse como una red comercial externa.

El análisis puede centrarse, según la evidencia disponible, en:

```text
dealer / grupo
→ territorio
→ marca
→ producto/modelo
→ VIN
→ evolución
→ posición dentro de la red dealer
→ contexto RVM territorial
```

No asumir disponibilidad de las mismas variables internas de gestión que existen para tiendas propias.

La ausencia de CRM, vendedor u otra evidencia interna equivalente no debe completarse mediante inferencia.

### 6.4 Geografía y cobertura comercial

La presencia territorial de CIDEF no es uniforme.

Existen zonas donde:

```text
CIDEF tiene tienda propia
+ existen dealers
```

y otras donde:

```text
CIDEF no tiene tienda propia
+ existe uno o más dealers
```

Esta diferencia debe considerarse especialmente al utilizar RVM.

RVM describe matriculaciones del mercado en una geografía. No describe automáticamente el mercado capturable por una tienda propia CIDEF.

Antes de relacionar RVM geográfico con desempeño CIDEF debe determinarse:

```text
1. qué presencia comercial tiene CIDEF en esa geografía;
2. si esa presencia corresponde a OWN_STORES, DEALERS o ambos;
3. qué universo comercial es pertinente para la pregunta;
4. si existe correspondencia territorial suficiente para realizar la comparación.
```

### 6.5 RVM no implica atribución de canal

Una matriculación observada en RVM no identifica por sí sola si el vehículo fue vendido por:

```text
CIDEF OWN_STORES
CIDEF DEALERS
otro actor del mercado
```

Por ello:

> No atribuir crecimiento o pérdida de RVM de una zona a tiendas propias o dealers sin evidencia adicional que permita relacionar correctamente mercado, territorio y canal comercial.

Ejemplo:

```text
Dongfeng crece 20% en una región
```

no implica:

```text
una tienda propia CIDEF de esa región
tenía disponible ese 20% de crecimiento
```

Puede existir participación relevante de dealers, diferencias de cobertura territorial u otros actores.

Tampoco debe interpretarse automáticamente:

```text
VIN OWN_STORES / RVM total
```

como penetración de `OWN_STORES`, porque RVM no proporciona por sí solo un denominador de mercado equivalente al canal `OWN_STORES`.

### 6.6 Comparación territorial con RVM

Cuando se utilice RVM para evaluar oportunidad o desempeño territorial, el agente debe distinguir al menos:

```text
MERCADO TERRITORIAL
        ↓
presencia comercial CIDEF
        ↓
┌─────────────────────┐
│ OWN_STORES          │
│ DEALERS             │
│ OWN_STORES+DEALERS  │
└─────────────────────┘
        ↓
universo comparable
```

Una oportunidad territorial puede existir para **CIDEF como red** sin que pueda atribuirse todavía a una tienda o dealer específico.

En ese caso, el agente debe mantener la conclusión al nivel soportado por la evidencia.

Ejemplo válido:

> La marca está creciendo en la región más rápido que los VIN CIDEF observados en ese territorio; existe una brecha que merece investigación.

No escalar automáticamente a:

> La tienda CIDEF está perdiendo ventas.

si dealers y tiendas propias participan simultáneamente en esa geografía y la evidencia no permite atribuir la brecha.

El principio rector es:

> **La geografía de mercado, la red de tiendas propias y la red de dealers son dimensiones relacionadas pero distintas. Antes de comparar VIN CIDEF con RVM, el agente debe determinar qué presencia comercial existe en el territorio y qué universo comercial es realmente comparable.**

## 7. Comparaciones deben ser justas

El agente debe evitar comparaciones que mezclen universos estructuralmente distintos.

Siempre que sea relevante debe comparar:

- tienda propia contra tiendas propias;
- dealer contra dealers;
- vendedor dentro de su tienda o universo aplicable;
- marca contra su mercado relevante;
- modelo contra su universo competitivo pertinente;
- resultado actual contra historia comparable.

El crecimiento absoluto por sí solo puede ser insuficiente.

Siempre que la evidencia lo permita, interesan también:

- crecimiento relativo;
- posición;
- share;
- trayectoria;
- expectativa;
- gap entre observado y esperable.

## 8. Marco preferido de análisis

Cuando sea posible, interpretar el desempeño en este orden:

```text
VIN observado
→ cambio temporal
→ comparación contra expectativa
→ comparación contra contexto
→ gap
→ evidencia explicativa disponible
→ riesgo u oportunidad
```

El agente debe distinguir claramente:

```text
hecho observado
≠ cálculo
≠ interpretación
≠ causalidad
```

## 9. Jerarquía del análisis comercial

Siempre que la evidencia lo permita, la navegación natural es:

```text
CIDEF
→ universo comercial
→ tienda / dealer
→ marca
→ vendedor
→ producto / modelo
```

La bajada de nivel debe realizarse para explicar VIN, no sólo para producir mayor detalle.

## 10. Qué constituye una buena respuesta

Una buena respuesta del agente debería ayudar a contestar al menos una de estas preguntas:

```text
¿Dónde estamos?
¿Por qué importa?
¿Cuántos VIN están involucrados?
¿Estamos creciendo como deberíamos?
¿Dónde podemos crecer más?
¿Dónde estamos dejando escapar crecimiento?
¿Dónde existe riesgo de deterioro?
¿Qué evidencia merece investigación o acción?
```

Describir datos sin establecer su relevancia para VIN tiene valor limitado.

## 11. Prudencia interpretativa

El agente no debe:

- buscar culpables;
- diagnosticar problemas sólo porque una métrica bajó;
- asumir que bajo desempeño implica mala gestión;
- asumir que una tienda grande debería necesariamente crecer más;
- convertir correlaciones en causas;
- utilizar un mes incompleto como si fuera un cierre;
- mezclar universos para obtener comparaciones más llamativas;
- presentar una oportunidad estimada como venta asegurada.

Cuando no exista evidencia suficiente, debe decir `NO_SABEMOS` o equivalente sustentado.

## 12. Evolución de estas reglas

Este documento es editable.

Las nuevas reglas de negocio pueden agregarse cuando exista suficiente aprendizaje del negocio para justificar un criterio permanente.

No deben incorporarse aquí equivalencias físicas o temporales que corresponden a MASTER o a motores deterministas, por ejemplo qué modelo pertenece a qué organización en una fecha determinada. Esas verdades permanecen en la capa determinista.
