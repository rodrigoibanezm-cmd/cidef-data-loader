# BUSINESS_AGENT_V0.1

## OBJETIVO

Definir contrato de negocio del agente analítico Cidef.

El agente DEBE responder preguntas de negocio mediante evidencia procesada + cálculo determinista + explicación LLM.

NO es un sistema de reportería BI.

## PRINCIPIO RECTOR

Las preguntas de negocio gobiernan arquitectura, datos, métricas y motores.

```text
PREGUNTA DE NEGOCIO
→ REQUISITOS DE EVIDENCIA
→ CAPAS DE DATOS
→ MÉTRICAS CERTIFICADAS
→ MOTOR DETERMINISTA
→ RESPUESTA EXPLICADA POR LLM
```

NO construir capas analíticas sin identificar qué pregunta, identidad, hecho o métrica justifican su existencia.

## CONTRATOS RELACIONADOS

- Arquitectura: `docs/architecture/CANONICAL_ANALYTICS_V0.1.md`.
- Familias de preguntas: `docs/business-agent/QUESTION_FAMILIES_V0.1.md`.
- MASTER: `docs/master/MASTER_LAYER_V0.1.md`.

## CASO DE USO INICIAL

Reunión comercial semanal.

### NECESIDAD

Supervisores deben comprender, por tienda y vendedor:

- resultado observado;
- cierre esperado;
- desviación respecto de lo esperable;
- señales tempranas de deterioro;
- posición relativa;
- evidencia que requiere gestión.

### REGLA

`ventas realizadas + negocios considerados seguros` NO constituye por sí solo una proyección determinista.

La expectativa de cierre debe usar historia, estacionalidad, ritmo intra-mes y comportamiento relativo según contrato de Familia 1.

## FUENTES

### ERP / CIDEF

RAW actuales principales:

- `vehiculos_raw`;
- `ventas_raw`;
- `notas_venta_raw`.

Evidencia disponible incluye VIN, producto, vendedor, NV, factura, fechas, estados operacionales, stock y otras señales del proceso comercial.

### REGLA ERP

Motores de negocio NO consumen estas RAW directamente.

Flujo obligatorio:

```text
RAW
→ MASTER
→ HECHOS CANÓNICOS
→ MÉTRICAS CERTIFICADAS
→ MARTS/CUBOS cuando aporten eficiencia
→ MOTORES
```

### RVM / ANAC

Fuente externa para mercado y posición competitiva.

Evidencia potencial:

- marca;
- modelo/versión;
- segmento/tipo;
- fecha;
- región/comuna;
- VIN;
- cantidad.

### REGLA RVM

RVM RAW NO debe ser consumida directamente por motores de negocio.

Antes de Familia 2 requiere:

- auditoría de grain;
- normalización;
- contrato `fact_mercado`;
- mapping de producto/mercado cuando corresponda;
- métricas certificadas de mercado;
- `cube_mercado` SOLO si agrega eficiencia.

## FUENTES NO DISPONIBLES / FUTURAS

### CRM

NO asumir pipeline comercial completo y confiable mientras no exista fuente integrada y validada.

### Forum / Finex

Puede aportar señales comerciales anteriores a factura.

NO asumir disponibilidad hasta implementar y validar integración.

La existencia futura de una fuente NO modifica contratos actuales sin evidencia.

## FAMILIAS DE PREGUNTAS V0.1

Contrato autoritativo: `QUESTION_FAMILIES_V0.1.md`.

1. Expectativa de cierre.
2. Posición competitiva.
3. Deterioro y red flags.
4. Desempeño relativo.
5. Accionabilidad.

### REGLAS

- 1 familia → 1 motor determinista.
- Auditores/validadores pueden ser transversales.
- Nuevas preguntas deben asignarse a una familia existente o justificar una nueva.
- NO crear motores por visualización, tabla o fuente.

## RESPONSABILIDAD DEL MOTOR

DEBE:

- recibir evidencia estructurada;
- aplicar cálculo/reglas deterministas;
- distinguir observado vs esperado/inferido;
- exponer evidencia suficiente para auditar la respuesta;
- declarar gaps cuando falte evidencia.

NO DEBE:

- redefinir identidad MASTER;
- redefinir métricas certificadas;
- consultar RAW de negocio directamente;
- inventar causalidad;
- convertir correlación en explicación causal demostrada.

## RESPONSABILIDAD DEL LLM

DEBE:

- identificar intención/pregunta;
- seleccionar motor/capacidad;
- interpretar output estructurado;
- explicar evidencia, límites y gaps.

NO DEBE:

- calcular indicadores críticos cuando existe contrato determinista;
- completar evidencia faltante;
- reemplazar reglas del motor por juicio semántico.

## OUTPUT ESPERADO DEL SISTEMA

Una respuesta de negocio debe poder separar explícitamente:

- qué ocurrió;
- qué debería estar ocurriendo cuando exista expectativa válida;
- magnitud/significancia de la desviación;
- trayectoria;
- evidencia explicativa disponible;
- unidad afectada;
- gaps o incertidumbre;
- necesidad de gestión cuando esté respaldada por evidencia.

## FUERA DE SCOPE

- reportería BI como objetivo del agente;
- respuestas calculadas directamente por LLM;
- recomendaciones específicas sin evidencia suficiente;
- atributos analíticos dinámicos convertidos en MASTER para simplificar motores.
