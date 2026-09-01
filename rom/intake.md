# Intake — CIDEF Motor Lab

## Responsabilidad

Transformar una pregunta de negocio en un **plan mínimo de evidencia** que permita demostrar una lógica determinista y, si corresponde, convertirla en un motor.

```text
pregunta natural
→ respuesta esperada
→ cálculo necesario
→ variables mínimas
→ evidencia requerida
→ consultas exploratorias mínimas
→ lógica demostrada
→ contrato de motor
```

El intake NO parte desde tablas, hechos, cubos ni motores existentes.

---

## 1. Pregunta activa

Antes de consultar datos, formular una sola pregunta de negocio concreta.

Ejemplos:

```text
¿Cuánto debería vender CIDEF este mes?
¿Por qué vendimos 18 VIN menos que el período comparable?
¿Qué sucursales explican la mayor parte de la caída?
¿Cuánto depende una tienda de los últimos 10 días del mes?
```

No mezclar varias preguntas superiores en una misma exploración.

---

## 2. Definir la respuesta antes de buscar datos

Precisar:

```text
objetivo
unidad
nivel de análisis
período
población
output esperado
```

Ejemplo:

```text
objetivo: explicar delta de ventas
unidad: VIN
nivel: CIDEF
período: mes A vs mes B
output: delta total + contribución por sucursal
```

---

## 3. Derivar el cálculo

Escribir la lógica conceptual mínima sin nombres físicos de columnas.

Ejemplo:

```text
delta_total = ventas_periodo_A - ventas_periodo_B
contribucion_sucursal = ventas_A_sucursal - ventas_B_sucursal
sum(contribucion_sucursal) = delta_total
```

No consultar data hasta poder decir qué variables hacen falta para probar esa lógica.

---

## 4. Identificar variables mínimas

Separar:

```text
hechos observados
identidades necesarias
fechas necesarias
filtros
agrupaciones
```

Para cada variable preguntar:

- ¿proviene de RAW?
- ¿requiere identidad MASTER?
- ¿la relación RAW→MASTER está ya demostrada?
- ¿es necesaria para responder o solo sería interesante tenerla?

Eliminar variables no esenciales.

---

## 5. Descubrimiento de evidencia

Usar las acciones en este orden cuando sea necesario:

### `list_tables`
Solo si existe duda sobre la superficie disponible.

### `table_schema`
Cuando no se conoce con certeza la estructura física.

### `profile_table`
Cuando hay que entender calidad, cardinalidad, valores o rango de una variable.

### `query_table`
Cuando ya se sabe qué slice o agregado concreto se necesita.

No ejecutar perfiles amplios por rutina.
No descargar filas si basta un agregado.
No explorar una tabla sin una necesidad analítica explícita.

---

## 6. RAW + MASTER

RAW y MASTER cumplen funciones distintas:

```text
RAW = evidencia de hechos/eventos/fuente
MASTER = identidad estable compartida
```

Una pregunta puede necesitar ambas.

No reemplazar identidad MASTER por normalización textual ad hoc.

Si la unión necesaria entre RAW y MASTER no puede probarse con las capacidades exploratorias actuales, documentar exactamente la relación requerida para que se implemente en backend como lógica fija.

---

## 7. Runtime no significa SQL libre

La lógica final puede ejecutarse en runtime sobre RAW + MASTER.

Eso NO autoriza al GPT a generar SQL arbitrario en producción.

El patrón objetivo es:

```text
motor predefinido
→ SQL fijo parametrizado
→ ejecución runtime
→ resultado determinista
```

Durante la etapa de diseño, las acciones exploratorias sirven para comprobar si el cálculo y sus mappings son válidos.

---

## 8. Cuándo cerrar la exploración

La exploración debe terminar cuando ya estén demostrados:

1. universo;
2. grain;
3. variables;
4. mappings de identidad necesarios;
5. fórmula;
6. casos límite materiales;
7. reconciliación básica del resultado.

No seguir consultando solo para acumular contexto.

---

## 9. Contrato de motor propuesto

Cuando la lógica esté cerrada, producir:

```text
name:
business_question:
inputs:
source_tables:
identity_dependencies:
calculation:
filters:
output:
coverage:
warnings:
validation:
shared_dependencies:
```

### Validación mínima

Todo motor debe permitir comprobar, cuando corresponda:

```text
universo fuente
universo usado
exclusiones
reconciliación de agregados
nulos/no resueltos
```

Si una descomposición debe sumar un total, esa igualdad forma parte del contrato.

---

## 10. Motor específico vs común

Antes de proponer una pieza común, verificar que exista reutilización real.

```text
misma lógica usada por varios motores
→ candidato a función/motor común

lógica usada por una sola familia
→ mantener dentro del motor específico
```

No anticipar una capa universal por elegancia arquitectónica.

---

## 11. Missing capability

Declarar una capacidad faltante solo cuando la pregunta requiera evidencia o combinación que las acciones actuales no pueden producir de forma confiable.

Describir:

```text
question
missing_evidence
required_relationship
source_tables
proposed_calculation
why_current_actions_are_insufficient
```

No simular joins complejos o hechos canónicos trayendo miles de filas al modelo.

---

## Checklist previo a cada llamada

- [ ] ¿Qué hecho concreto quiero demostrar?
- [ ] ¿Esta llamada es la mínima suficiente?
- [ ] ¿Conozco los nombres físicos reales?
- [ ] ¿Necesito RAW, MASTER o ambos?
- [ ] ¿Puedo agregar antes de traer detalle?
- [ ] ¿La ventana temporal está acotada?
- [ ] ¿La dimensión solicitada participa realmente del cálculo?
- [ ] ¿Estoy evitando reconstrucciones manuales frágiles?
- [ ] ¿El resultado de esta llamada puede cambiar o cerrar la lógica?

Si la última respuesta es no, no ejecutar la llamada.
